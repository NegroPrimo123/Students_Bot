import { Injectable, Logger } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { ParticipationsService } from '../participations/participations.service';

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    private studentsService: StudentsService,
    private eventsService: EventsService,
    private participationsService: ParticipationsService,
  ) {}

  // Убираем работу с userStates, передаем состояние как параметр
  async handleCertificateUpload(ctx: Context, userState: any) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    // Устанавливаем состояние для загрузки сертификата
    userState.step = 'waiting_for_certificate';
    userState.action = 'upload_certificate';

    await ctx.reply(
      '📎 Отправьте сертификат в виде документа (PDF, JPG, PNG):\n\n' +
      'После загрузки файла вы сможете выбрать мероприятие.'
    );
  }

  async handleDocument(ctx: Context, userState: any, fileId: string, fileName: string, fileSize?: number) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    // Проверяем размер файла (максимум 20MB)
    if (fileSize && fileSize > 20 * 1024 * 1024) {
      await ctx.reply('❌ Файл слишком большой. Максимальный размер: 20MB');
      return;
    }

    if (userState && userState.step === 'waiting_event_certificate' && userState.selectedEventId) {
      // Это сертификат для конкретного мероприятия (из кнопки "Участвовал")
      await this.handleEventCertificate(ctx, userState.selectedEventId, fileId, fileName);
    } else {
      // Это общая загрузка сертификата (из кнопки "Отправить сертификат")
      await this.handleGeneralCertificate(ctx, fileId, fileName, userState);
    }
  }

  private async handleEventCertificate(ctx: Context, eventId: number, fileId: string, fileName: string) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    const event = await this.eventsService.findById(eventId);

    if (!student || !event) {
      await ctx.reply('❌ Ошибка: студент или мероприятие не найдены.');
      return;
    }

    try {
      // Создаем запись об участии
      const participation = await this.participationsService.createParticipation({
        studentId: student.id,
        eventId: eventId,
        certificateFileId: fileId,
      });

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
        await ctx.reply('❌ Произошла ошибка при регистрации участия.');
        this.logger.error('Event participation error:', error);
      }
    }
  }

  private async handleGeneralCertificate(ctx: Context, fileId: string, fileName: string, userState: any) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;

    // Сохраняем file_id в состоянии пользователя
    userState.step = 'certificate_uploaded';
    userState.action = 'upload_certificate';
    userState.certificateFileId = fileId;
    userState.certificateFileName = fileName;

    await ctx.reply(
      `✅ Сертификат "${fileName}" успешно загружен!\n\n` +
      `Теперь выберите мероприятие, к которому относится этот сертификат:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📅 Выбрать мероприятие', 'select_event_for_certificate')]
      ])
    );
  }

  async handleSelectEventForCertificate(ctx: Context, userState: any) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    
    // Проверяем, есть ли загруженный сертификат
    if (!userState || !userState.certificateFileId) {
      await ctx.reply(
        '❌ Сначала отправьте сертификат как документ.\n\n' +
        'Пожалуйста, отправьте файл и затем нажмите "📅 Выбрать мероприятие" снова.'
      );
      return;
    }

    await this.showEventsForCertificateSelection(ctx, 0);
  }

  // Делаем метод публичным
  async showEventsForCertificateSelection(ctx: Context, page: number = 0) {
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

    const eventsPerPage = 6;
    const totalPages = Math.ceil(events.length / eventsPerPage);
    
    const startIndex = page * eventsPerPage;
    const endIndex = startIndex + eventsPerPage;
    const pageEvents = events.slice(startIndex, endIndex);

    // Создаем кнопки мероприятий
    const eventButtons: any[][] = pageEvents.map(event => 
      [Markup.button.callback(
        `🎯 ${event.title} (${event.points_awarded} баллов)`, 
        `certificate_event:${event.id}`
      )]
    );

    // Кнопки навигации
    const navigationRow: any[] = [];
    if (page > 0) {
      navigationRow.push(Markup.button.callback('⬅️ Назад', `certificate_events_page:${page - 1}`));
    }
    if (page < totalPages - 1) {
      navigationRow.push(Markup.button.callback('Вперед ➡️', `certificate_events_page:${page + 1}`));
    }
    
    if (navigationRow.length > 0) {
      eventButtons.push(navigationRow);
    }

    const messageText = `Выберите мероприятие для сертификата (страница ${page + 1} из ${totalPages}):`;

    try {
      // Пытаемся отредактировать сообщение, если это callback
      if ((ctx.callbackQuery as any).message) {
        await ctx.editMessageText(messageText, Markup.inlineKeyboard(eventButtons));
      } else {
        await ctx.reply(messageText, Markup.inlineKeyboard(eventButtons));
      }
    } catch (error) {
      // Если не получается отредактировать, отправляем новое сообщение
      await ctx.reply(messageText, Markup.inlineKeyboard(eventButtons));
    }
  }

  async handleCertificateEventSelection(ctx: Context, eventId: number, userState: any) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    
    // Проверяем, есть ли загруженный сертификат
    if (!userState || !userState.certificateFileId) {
      await ctx.reply(
        '❌ Ошибка: сертификат не найден. Попробуйте начать заново.'
      );
      return;
    }

    const student = await this.studentsService.findByTelegramId(telegramId);
    const event = await this.eventsService.findById(eventId);

    if (!student || !event) {
      await ctx.reply('❌ Ошибка: студент или мероприятие не найдены.');
      return;
    }

    try {
      // Проверяем, не существует ли уже участие
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

      // Создаем запись об участии
      const participation = await this.participationsService.createParticipation({
        studentId: student.id,
        eventId: eventId,
        certificateFileId: userState.certificateFileId,
      });

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
        await ctx.reply('❌ Произошла ошибка при отправке сертификата.');
        this.logger.error('Certificate submission error:', error);
      }
    }
  }

  async handleParticipation(ctx: Context, eventId: number, userState: any) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) return;

    // Проверяем, не участвует ли уже студент
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

    // Сохраняем выбранное мероприятие в состоянии
    userState.selectedEventId = eventId;
    userState.step = 'waiting_event_certificate';
  }
}
