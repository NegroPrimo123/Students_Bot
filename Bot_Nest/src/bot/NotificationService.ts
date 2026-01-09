import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { ParticipationsService } from '../participations/participations.service';
import { StatisticsService } from '../statistics/statistics.service';
import { Participation } from '../participations/participation.entity';
import { Student } from '../students/student.entity';
import { ParticipationStatus } from './constants';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private bot: Telegraf;

  constructor(
    private configService: ConfigService,
    private studentsService: StudentsService,
    private eventsService: EventsService,
    private participationsService: ParticipationsService,
    private statisticsService: StatisticsService,
  ) {
    this.initializeBot();
  }

  private initializeBot(): void {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error('❌ TELEGRAM_BOT_TOKEN is not defined in .env file');
      return;
    }

    try {
      this.bot = new Telegraf(token);
      this.logger.log('✅ NotificationService bot instance created');
    } catch (error) {
      this.logger.error('❌ Bot creation failed:', error);
    }
  }
  /**
   * Уведомление студента об изменении статуса участия
   */
  async notifyStatusChange(participation: Participation, oldStatus: string): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, skipping notification');
      return;
    }

    const student = participation.student;
    const event = participation.event;

    let message = `📢 Статус вашего участия изменен!\n\n`;
    message += `🎯 Мероприятие: ${event.title}\n`;
    message += `📊 Баллы: ${event.points_awarded}\n`;
    message += `🔄 Статус: ${this.getStatusText(participation.status)}\n`;

    if (participation.admin_comment) {
      message += `💬 Комментарий администратора: ${participation.admin_comment}\n`;
    }

    message += `\nТеперь ваш рейтинг: ${student.rating.toFixed(2)}/5.0`;

    try {
      await this.bot.telegram.sendMessage(student.telegram_id, message);
      this.logger.log(`Notification sent to student ${student.id}`);
    } catch (error) {
      this.logger.error(`Failed to notify student ${student.id}:`, error);
    }
  }

  /**
   * Уведомление о штрафе за неактивность
   */
  async notifyInactivityPenalty(student: Student, daysInactive: number, newRating: number): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, skipping penalty notification');
      return;
    }

    const message = `⚠️ Внимание! Ваш рейтинг снижен\n\n` +
      `Вы не участвовали в мероприятиях ${daysInactive} дней.\n` +
      `📉 Новый рейтинг: ${newRating.toFixed(2)}/5.0\n\n` +
      `🎯 Примите участие в мероприятиях, чтобы повысить рейтинг!\n` +
      `Используйте команду /events для просмотра доступных мероприятий.`;

    try {
      await this.bot.telegram.sendMessage(student.telegram_id, message);
      this.logger.log(`Inactivity penalty notified to student ${student.id}`);
    } catch (error) {
      this.logger.error(`Failed to send penalty notification to student ${student.id}:`, error);
    }
  }

  /**
   * Напоминания о мероприятиях (запускается по расписанию)
   */
  @Cron('0 9 * * *') // Каждый день в 9:00
  async sendEventReminders(): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, skipping event reminders');
      return;
    }

    this.logger.log('Sending event reminders...');

    try {
      const events = await this.eventsService.findAll();
      const today = new Date();

      // Ищем мероприятия, созданные в последние 3 дня
      const recentEvents = events.filter(event => {
        const eventDate = new Date(event.created_at);
        const diffTime = today.getTime() - eventDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays <= 3;
      });

      this.logger.log(`Found ${recentEvents.length} recent events for reminders`);

      if (recentEvents.length === 0) {
        this.logger.log('No recent events for reminders');
        return;
      }

      let totalRemindersSent = 0;
      let totalErrors = 0;

      for (const event of recentEvents) {
        this.logger.log(`Processing event: ${event.title} (ID: ${event.id})`);

        try {
          const students = await this.studentsService.getStudentsByCourse(event.course);
          this.logger.log(`Found ${students.length} students for course ${event.course}`);

          for (const student of students) {
            try {
              const isParticipating = await this.participationsService.checkExistingParticipation(
                student.id,
                event.id
              );

              if (!isParticipating) {
                this.logger.log(`Sending reminder to student ${student.id} for event ${event.id}`);

                await this.bot.telegram.sendMessage(
                  student.telegram_id,
                  `🔔 Напоминание о новом мероприятии!\n\n` +
                  `📅 ${event.title}\n` +
                  `📝 ${event.description}\n` +
                  `🎯 Баллы: ${event.points_awarded}\n\n` +
                  `Не забудьте принять участие! Используйте команду /events`
                );

                totalRemindersSent++;

                // Задержка чтобы не превысить лимиты Telegram
                await new Promise(resolve => setTimeout(resolve, 100));
              } else {
                this.logger.log(`Student ${student.id} already participating in event ${event.id}`);
              }
            } catch (error) {
              this.logger.error(`Failed to send reminder to student ${student.id}:`, error);
              totalErrors++;
            }
          }
        } catch (error) {
          this.logger.error(`Error processing event ${event.id}:`, error);
        }
      }

      this.logger.log(`Event reminders completed: ${totalRemindersSent} sent, ${totalErrors} errors`);
    } catch (error) {
      this.logger.error('Error sending event reminders:', error);
    }
  }

  /**
   * Команда для просмотра статистики (для администраторов)
   */
  async handleStats(ctx: any): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const adminIds = this.configService.get<string>('ADMIN_TELEGRAM_IDS')?.split(',').map(Number) || [];

    if (!adminIds.includes(telegramId)) {
      await ctx.reply('❌ У вас нет прав для просмотра статистики');
      return;
    }

    try {
      await ctx.reply('🔄 Получение статистики...');

      const stats = await this.statisticsService.getAdminStatistics();

      let message = `📊 Статистика системы\n\n`;
      message += `👥 Всего студентов: ${stats.totalStudents}\n`;
      message += `📅 Всего мероприятий: ${stats.totalEvents}\n`;
      message += `⏳ Ожидают проверки: ${stats.pendingParticipations}\n`;
      message += `⚠️ Низкий рейтинг (<3.0): ${stats.lowRatingStudents}\n`;
      message += `📈 Средний рейтинг: ${stats.averageRating}/5.0\n`;
      message += `✅ Процент подтверждений: ${stats.approvalRate}\n`;

      await ctx.reply(message);
    } catch (error) {
      this.logger.error('Error getting statistics:', error);
      await ctx.reply('❌ Ошибка при получении статистики');
    }
  }

  /**
   * Применение штрафов за неактивность (ручная команда для админов)
   */
  async handleApplyPenalties(ctx: any): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const adminIds = this.configService.get<string>('ADMIN_TELEGRAM_IDS')?.split(',').map(Number) || [];

    if (!adminIds.includes(telegramId)) {
      await ctx.reply('❌ У вас нет прав для применения штрафов');
      return;
    }

    try {
      await ctx.reply('🔄 Проверка пропущенных мероприятий за последние 30 дней...');

      const result = await this.participationsService.applyMissedEventPenalty();

      if (result.penalizedStudents === 0) {
        await ctx.reply(
          '✅ Штрафы не применены!\n\n' +
          'Все студенты участвовали хотя бы в одном мероприятии за последние 30 дней.'
        );
      } else {
        await ctx.reply(
          `✅ Штрафы за пропущенные мероприятия применены!\n\n` +
          `👤 Затронуто студентов: ${result.penalizedStudents}\n` +
          `⏰ Период проверки: последние 30 дней\n` +
          `📉 Штраф: -1.0 к рейтингу\n` +
          `🎯 Критерий: неучастие в мероприятиях`
        );
      }
    } catch (error) {
      this.logger.error('Error applying missed event penalties:', error);
      await ctx.reply('❌ Ошибка при применении штрафов');
    }
  }

  private getStatusText(status: string): string {
    const statusMap = {
      [ParticipationStatus.PENDING]: 'Ожидает проверки',
      [ParticipationStatus.APPROVED]: 'Подтверждено',
      [ParticipationStatus.REJECTED]: 'Отклонено'
    };
    return statusMap[status] || status;
  }

  // Метод для остановки бота (при необходимости)
  async stopBot(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.logger.log('🛑 NotificationService bot stopped');
    }
  }
}