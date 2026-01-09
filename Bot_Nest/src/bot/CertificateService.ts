import { Injectable, Logger } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { ParticipationsService } from '../participations/participations.service';
import { StateService } from './state.service';
import { UserState, ParticipationData } from './interfaces';
import { UserStep, UserAction, CallbackAction, EVENTS_PER_PAGE } from './constants';

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    private studentsService: StudentsService,
    private eventsService: EventsService,
    private participationsService: ParticipationsService,
    private stateService: StateService,
  ) {}

  async handleCertificateUpload(ctx: Context, userState?: UserState): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    this.stateService.updateUserState(telegramId, {
      step: UserStep.WAITING_FOR_CERTIFICATE,
      action: UserAction.UPLOAD_CERTIFICATE
    });

    await ctx.reply(
      '📎 Отправьте сертификат в виде документа (PDF, JPG, PNG):\n\n' +
      'После загрузки файла вы сможете выбрать мероприятие.'
    );
  }

  async handleDocument(
    ctx: Context,
    userState: UserState,
    fileId: string,
    fileName: string,
    fileSize?: number
  ): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    if (userState.step === UserStep.WAITING_EVENT_CERTIFICATE && userState.selectedEventId) {
      await this.handleEventCertificate(ctx, userState.selectedEventId, fileId, fileName);
    } else {
      await this.handleGeneralCertificate(ctx, fileId, fileName, userState);
    }
  }

  private async handleEventCertificate(ctx: Context, eventId: number, fileId: string, fileName: string): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    const event = await this.eventsService.findById(eventId);

    if (!student || !event) {
      await ctx.reply('❌ Ошибка: студент или мероприятие не найдены.');
      return;
    }

    try {
      const participationData: ParticipationData = {
        studentId: student.id,
        eventId,
        certificateFileId: fileId,
      };

      await this.participationsService.createParticipation(participationData);
      this.stateService.deleteUserState(telegramId);

      await ctx.reply(
        `✅ Участие зарегистрировано!\n\n` +
        `📅 Мероприятие: ${event.title}\n` +
        `👤 Студент: ${student.first_name} ${student.last_name}\n` +
        `🏫 Группа: ${student.group}\n` +
        `📊 Баллы: ${event.points_awarded}\n` +
        `📋 Статус: Ожидает проверки администратором\n\n` +
        `Администратор проверит ваш сертификат и обновит статус.`
      );
    } catch (error: any) {
      if (error.message === 'Вы уже участвуете в этом мероприятии') {
        await ctx.reply(
          '❌ Вы уже участвуете в этом мероприятии!\n\n' +
          'Один студент может участвовать в каждом мероприятии только один раз.'
        );
      } else {
        this.logger.error(`Event certificate error for user ${telegramId}:`, error);
        await ctx.reply('❌ Произошла ошибка при регистрации участия.');
      }
    }
  }

  private async handleGeneralCertificate(
    ctx: Context,
    fileId: string,
    fileName: string,
    userState: UserState
  ): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    this.stateService.updateUserState(telegramId, {
      step: UserStep.CERTIFICATE_UPLOADED,
      action: UserAction.UPLOAD_CERTIFICATE,
      certificateFileId: fileId,
      certificateFileName: fileName
    });

    await ctx.reply(
      `✅ Сертификат "${fileName}" успешно загружен!\n\n` +
      `Теперь выберите мероприятие, к которому относится этот сертификат:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📅 Выбрать мероприятие', CallbackAction.SELECT_EVENT_FOR_CERTIFICATE)]
      ])
    );
  }

  async handleSelectEventForCertificate(ctx: Context, userState: UserState): Promise<void> {
    if (!ctx.from) return;

    if (!userState || !userState.certificateFileId) {
      await ctx.reply(
        '❌ Сначала отправьте сертификат как документ.\n\n' +
        'Пожалуйста, отправьте файл и затем нажмите "📅 Выбрать мероприятие" снова.'
      );
      return;
    }

    await this.showEventsForCertificateSelection(ctx, 0);
  }

  async showEventsForCertificateSelection(ctx: Context, page: number = 0): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    const events = await this.eventsService.getEventsByCourse(student.course);

    if (events.length === 0) {
      await ctx.reply('❌ Нет доступных мероприятий.');
      return;
    }

    const totalPages = Math.ceil(events.length / EVENTS_PER_PAGE);
    const startIndex = page * EVENTS_PER_PAGE;
    const endIndex = startIndex + EVENTS_PER_PAGE;
    const pageEvents = events.slice(startIndex, endIndex);

    // Создаем кнопки мероприятий
    const eventButtons: any[][] = pageEvents.map(event =>
      [Markup.button.callback(
        `🎯 ${event.title} (${event.points_awarded} баллов)`,
        `${CallbackAction.CERTIFICATE_EVENT}:${event.id}`
      )]
    );

    // Кнопки навигации
    const navigationRow: any[] = [];
    if (page > 0) {
      navigationRow.push(Markup.button.callback('⬅️ Назад', `${CallbackAction.CERTIFICATE_EVENTS_PAGE}:${page - 1}`));
    }
    if (page < totalPages - 1) {
      navigationRow.push(Markup.button.callback('Вперед ➡️', `${CallbackAction.CERTIFICATE_EVENTS_PAGE}:${page + 1}`));
    }

    if (navigationRow.length > 0) {
      eventButtons.push(navigationRow);
    }

    const messageText = `Выберите мероприятие для сертификата (страница ${page + 1} из ${totalPages}):`;

    try {
      if ((ctx.callbackQuery as any).message) {
        await ctx.editMessageText(messageText, Markup.inlineKeyboard(eventButtons));
      } else {
        await ctx.reply(messageText, Markup.inlineKeyboard(eventButtons));
      }
    } catch (error) {
      await ctx.reply(messageText, Markup.inlineKeyboard(eventButtons));
    }
  }

  async handleCertificateEventSelection(ctx: Context, eventId: number, userState: UserState): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;

    if (!userState || !userState.certificateFileId) {
      await ctx.reply('❌ Ошибка: сертификат не найден. Попробуйте начать заново.');
      return;
    }

    const student = await this.studentsService.findByTelegramId(telegramId);
    const event = await this.eventsService.findById(eventId);

    if (!student || !event) {
      await ctx.reply('❌ Ошибка: студент или мероприятие не найдены.');
      return;
    }

    try {
      const existingParticipation = await this.participationsService.checkExistingParticipation(
        student.id,
        eventId
      );

      if (existingParticipation) {
        await ctx.reply(
          '❌ Вы уже участвуете в этом мероприятии!\n\n' +
          'Один студент может участвовать в каждом мероприятии только один раз.'
        );
        return;
      }

      const participationData: ParticipationData = {
        studentId: student.id,
        eventId,
        certificateFileId: userState.certificateFileId,
      };

      await this.participationsService.createParticipation(participationData);
      this.stateService.deleteUserState(telegramId);

      await ctx.editMessageText(
        `✅ Сертификат успешно отправлен на проверку!\n\n` +
        `📅 Мероприятие: ${event.title}\n` +
        `👤 Студент: ${student.first_name} ${student.last_name}\n` +
        `🏫 Группа: ${student.group}\n` +
        `📊 Баллы: ${event.points_awarded}\n` +
        `📋 Статус: Ожидает проверки администратором\n\n` +
        `Администратор проверит ваш сертификат и обновит статус. ` +
        `Вы можете отслеживать статус в разделе "📅 Мои мероприятия".`
      );
    } catch (error: any) {
      if (error.message === 'Вы уже участвуете в этом мероприятии') {
        await ctx.reply(
          '❌ Вы уже участвуете в этом мероприятии!\n\n' +
          'Один студент может участвовать в каждом мероприятии только один раз.'
        );
      } else {
        this.logger.error(`Certificate submission error for user ${telegramId}:`, error);
        await ctx.reply('❌ Произошла ошибка при отправке сертификата.');
      }
    }
  }

  async handleParticipation(ctx: Context, eventId: number, userState: UserState): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) return;

    const existingParticipation = await this.participationsService.checkExistingParticipation(
      student.id,
      eventId
    );

    if (existingParticipation) {
      await ctx.reply(
        '❌ Вы уже участвуете в этом мероприятии!\n\n' +
        'Один студент может участвовать в каждом мероприятии только один раз.'
      );
      return;
    }

    const event = await this.eventsService.findById(eventId);
    if (!event) return;

    await ctx.reply(
      `🎯 Вы выбрали: ${event.title}\n\n` +
      `Отправьте сертификат участия в виде документа (PDF, JPG, PNG).\n\n` +
      `После загрузки файла вы сможете подтвердить участие.`
    );

    this.stateService.updateUserState(telegramId, {
      selectedEventId: eventId,
      step: UserStep.WAITING_EVENT_CERTIFICATE
    });
  }
}