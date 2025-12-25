import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf, Context, Markup } from 'telegraf'; // Добавляем импорт Markup
import { ConfigService } from '@nestjs/config';
import { RegistrationService } from './RegistrationService';
import { CertificateService } from './CertificateService';
import { NotificationService } from './NotificationService';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { ParticipationsService } from '../participations/participations.service';
import { GroupsService } from '../groups/groups.service';
import { StatisticsService } from '../statistics/statistics.service';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly bot: Telegraf;
  private userStates = new Map<number, any>();

  constructor(
    private configService: ConfigService,
    private registrationService: RegistrationService,
    private certificateService: CertificateService,
    private notificationService: NotificationService,
    private studentsService: StudentsService,
    private eventsService: EventsService,
    private participationsService: ParticipationsService,
    private groupsService: GroupsService,
    private statisticsService: StatisticsService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN is not defined in .env file');
      return;
    }
    
    try {
      this.bot = new Telegraf(token);
      this.setupHandlers();
      console.log('✅ Bot instance created');
    } catch (error) {
      console.error('❌ Bot creation failed:', error);
    }
  }

  private setupHandlers() {
    this.bot.start(this.handleStart.bind(this));
    this.bot.command('events', this.handleEvents.bind(this));
    this.bot.command('rating', this.handleRating.bind(this));
    this.bot.command('profile', this.handleProfile.bind(this));
    this.bot.command('edit_profile', this.handleEditProfile.bind(this));
    this.bot.command('stats', this.handleStats.bind(this));
    this.bot.command('apply_penalties', this.handleApplyPenalties.bind(this));
    this.bot.on('document', this.handleDocument.bind(this));
    this.bot.on('callback_query', this.handleCallback.bind(this));
    this.bot.on('text', this.handleText.bind(this));
  }

  async handleStart(ctx: Context) {
    await this.registrationService.handleStart(ctx);
  }

  async handleText(ctx: Context) {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

    const telegramId = ctx.from.id;
    const text = ctx.message.text;
    const userState = this.userStates.get(telegramId);

    // Обработка команд из клавиатуры
    switch (text) {
      case '👤 Мой профиль':
        await this.registrationService.handleProfile(ctx);
        break;
      
      case '📊 Все мероприятия':
        await this.handleEvents(ctx);
        break;
      
      case '📎 Отправить сертификат':
        await this.certificateService.handleCertificateUpload(ctx, userState);
        break;
      
      case '⭐ Мой рейтинг':
        await this.registrationService.handleRating(ctx);
        break;
      
      case '📅 Мои мероприятия':
        await this.handleMyEvents(ctx);
        break;
      
      default:
        await this.registrationService.handleText(ctx, text);
        break;
    }
  }

  async handleCallback(ctx: Context) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery) || !ctx.from) return;
    
    const data = (ctx.callbackQuery as any).data;
    const telegramId = ctx.from.id;
    let userState = this.userStates.get(telegramId);

    if (!userState) {
      userState = {};
      this.userStates.set(telegramId, userState);
    }

    if (data.startsWith('course:') || data.startsWith('group:') || 
        data.startsWith('groups_page:') || data.startsWith('edit_')) {
      await this.registrationService.handleCallback(ctx, data);
    } 
    else if (data === 'select_event_for_certificate') {
      await this.certificateService.handleSelectEventForCertificate(ctx, userState);
    } 
    else if (data.startsWith('certificate_events_page:')) {
      const page = parseInt(data.split(':')[1]);
      await this.certificateService.showEventsForCertificateSelection(ctx, page); // Теперь публичный метод
    }
    else if (data.startsWith('certificate_event:')) {
      const eventId = parseInt(data.split(':')[1]);
      await this.certificateService.handleCertificateEventSelection(ctx, eventId, userState);
    }
    else if (data.startsWith('participate:')) {
      const eventId = parseInt(data.split(':')[1]);
      await this.certificateService.handleParticipation(ctx, eventId, userState);
    } 
    else if (data === 'already_participating') {
      await ctx.reply(
        'ℹ️ Вы уже участвуете в этом мероприятии.\n\n' +
        'Один студент может участвовать в каждом мероприятии только один раз.'
      );
    }
  }

  async handleDocument(ctx: Context) {
    if (!ctx.from || !ctx.message || !('document' in ctx.message)) return;

    const telegramId = ctx.from.id;
    let userState = this.userStates.get(telegramId);

    if (!userState) {
      userState = {};
      this.userStates.set(telegramId, userState);
    }

    const fileId = ctx.message.document.file_id;
    const fileName = ctx.message.document.file_name || 'Неизвестный файл';
    const fileSize = ctx.message.document.file_size;
    
    await this.certificateService.handleDocument(ctx, userState, fileId, fileName, fileSize);
  }

  async handleEvents(ctx: Context) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    const events = await this.eventsService.getEventsByCourse(student.course);
    
    if (events.length === 0) {
      await ctx.reply('На вашем курсе пока нет мероприятий.');
      return;
    }

    for (const event of events) {
      // Проверяем, участвует ли уже студент в этом мероприятии
      const isParticipating = await this.participationsService.checkExistingParticipation(
        student.id, 
        event.id
      );

      let buttonText = 'Участвовать ✅';
      let callbackData = `participate:${event.id}`;
      
      if (isParticipating) {
        buttonText = '✅ Уже участвуете';
        callbackData = 'already_participating';
      }

      const buttons = [Markup.button.callback(buttonText, callbackData)];
      
      await ctx.reply(
        `📅 ${event.title}\n\n${event.description}\n\nБаллы: ${event.points_awarded}`,
        Markup.inlineKeyboard(buttons)
      );
    }
  }

  private async handleMyEvents(ctx: Context) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    // Получаем ВСЕ участия, включая архивированные мероприятия
    const participations = await this.participationsService.getStudentParticipations(student.id);
    
    if (participations.length === 0) {
      await ctx.reply('Вы еще не участвовали в мероприятиях.');
      return;
    }

    let message = '📅 Ваши участия в мероприятиях:\n\n';
    
    for (const participation of participations) {
      const statusEmoji = participation.status === 'approved' ? '✅' : 
                         participation.status === 'rejected' ? '❌' : '⏳';
      const archivedEmoji = participation.event.is_archived ? '📁 ' : '';
      
      message += `${archivedEmoji}${statusEmoji} ${participation.event.title}\n`;
      message += `Статус: ${this.getStatusText(participation.status)}\n`;
      
      if (participation.admin_comment) {
        message += `Комментарий: ${participation.admin_comment}\n`;
      }
      
      message += `Дата: ${participation.created_at.toLocaleDateString()}\n\n`;
    }

    await ctx.reply(message);
  }

  private getStatusText(status: string): string {
    const statusMap = {
      'pending': 'Ожидает проверки',
      'approved': 'Подтверждено',
      'rejected': 'Отклонено'
    };
    return statusMap[status] || status;
  }

  async handleProfile(ctx: Context) {
    await this.registrationService.handleProfile(ctx);
  }

  async handleEditProfile(ctx: Context) {
    await this.registrationService.handleEditProfile(ctx);
  }

  async handleRating(ctx: Context) {
    await this.registrationService.handleRating(ctx);
  }

  async handleStats(ctx: Context) {
    await this.notificationService.handleStats(ctx);
  }

  async handleApplyPenalties(ctx: Context) {
    await this.notificationService.handleApplyPenalties(ctx);
  }

  async onModuleInit() {
    await this.startPolling();
  }

  async startPolling() {
    try {
      this.bot.launch().then(() => {
        console.log('✅ Bot started successfully!');
      }).catch(error => {
        console.error('❌ Bot failed to start:', error);
      });
      
      console.log('🤖 Bot is starting in background...');
    } catch (error) {
      console.error('❌ Bot startup error:', error);
    }
  }

  async stopBot() {
    this.bot.stop();
  }

  getUserState(telegramId: number): any {
    return this.userStates.get(telegramId);
  }

  setUserState(telegramId: number, state: any): void {
    this.userStates.set(telegramId, state);
  }

  deleteUserState(telegramId: number): void {
    this.userStates.delete(telegramId);
  }
}
