import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Telegraf, Context, Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { ParticipationsService } from '../participations/participations.service';
import { GroupsService } from '../groups/groups.service';
import { StatisticsService } from '../statistics/statistics.service';
import { Participation } from '../participations/participation.entity';
import { Student } from '../students/student.entity';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly bot: Telegraf;
  private readonly logger = new Logger(BotService.name);
  private userStates = new Map<number, any>();

  constructor(
    private configService: ConfigService,
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
    this.bot.command('stats', this.handleStats.bind(this)); // НОВАЯ КОМАНДА
    this.bot.command('apply_penalties', this.handleApplyPenalties.bind(this)); // НОВАЯ КОМАНДА
    this.bot.on('document', this.handleDocument.bind(this));
    this.bot.on('callback_query', this.handleCallback.bind(this));
    this.bot.on('text', this.handleText.bind(this));
  }

  async handleStart(ctx: Context) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const existingStudent = await this.studentsService.findByTelegramId(telegramId);
    
    if (existingStudent) {
      await ctx.reply(
        `С возвращением, ${existingStudent.first_name}!`,
        this.getMainKeyboard()
      );
      return;
    }

    // Начинаем процесс регистрации
    this.userStates.set(telegramId, { step: 'registration' });
    await ctx.reply(
      'Добро пожаловать! Для регистрации введите ваше ФИО (например: Иванов Иван Иванович):'
    );
  }

  async handleText(ctx: Context) {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

    const telegramId = ctx.from.id;
    const text = ctx.message.text;

    // Обработка команд из клавиатуры
    switch (text) {
      case '👤 Мой профиль':
        await this.handleProfile(ctx);
        break;
      
      case '📊 Все мероприятия':
        await this.handleEvents(ctx);
        break;
      
      case '📎 Отправить сертификат':
        await this.handleCertificateUpload(ctx);
        break;
      
      case '⭐ Мой рейтинг':
        await this.handleRating(ctx);
        break;
      
      case '📅 Мои мероприятия':
        await this.handleMyEvents(ctx);
        break;
      
      default:
        // Обработка состояний регистрации и редактирования ФИО
        const userState = this.userStates.get(telegramId);
        if (userState && userState.step === 'registration' && !userState.fio) {
          await this.handleFioInput(ctx, text);
        } else if (userState && userState.step === 'editing_fio') {
          await this.handleFioEdit(ctx, text);
        }
        break;
    }
  }

  private async handleFioInput(ctx: Context, text: string) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const userState = this.userStates.get(telegramId);
    
    const fioParts = text.trim().split(' ');
    if (fioParts.length < 2) {
      await ctx.reply('Пожалуйста, введите ФИО полностью (например: Иванов Иван Иванович):');
      return;
    }

    userState.fio = {
      last_name: fioParts[0],
      first_name: fioParts[1],
      middle_name: fioParts[2] || null
    };
    userState.step = 'select_course';

    await ctx.reply(
      'Отлично! Теперь выберите ваш курс:',
      Markup.inlineKeyboard([
        [Markup.button.callback('1 курс', 'course:1')],
        [Markup.button.callback('2 курс', 'course:2')],
        [Markup.button.callback('3 курс', 'course:3')],
      ])
    );
  }

  private async handleFioEdit(ctx: Context, text: string) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const fioParts = text.trim().split(' ');
    if (fioParts.length < 2) {
      await ctx.reply('Пожалуйста, введите ФИО полностью (например: Иванов Иван Иванович):');
      return;
    }

    try {
      await this.studentsService.updateStudentProfile(telegramId, {
        last_name: fioParts[0],
        first_name: fioParts[1],
        middle_name: fioParts[2] || null
      });

      this.userStates.delete(telegramId);
      await ctx.reply('✅ ФИО успешно обновлено!', this.getMainKeyboard());
    } catch (error) {
      await ctx.reply('❌ Произошла ошибка при обновлении профиля.');
    }
  }

  private async handleCertificateUpload(ctx: Context) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    // Устанавливаем состояние для загрузки сертификата
    this.userStates.set(telegramId, { 
      step: 'waiting_for_certificate',
      action: 'upload_certificate'
    });

    await ctx.reply(
      '📎 Отправьте сертификат в виде документа (PDF, JPG, PNG):\n\n' +
      'После загрузки файла вы сможете выбрать мероприятие.'
    );
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

  async handleCallback(ctx: Context) {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery) || !ctx.from) return;
    
    const data = (ctx.callbackQuery as any).data;
    const telegramId = ctx.from.id;
    const userState = this.userStates.get(telegramId);

    if (data.startsWith('course:')) {
      const course = parseInt(data.split(':')[1]);
      const groups = this.groupsService.getGroupsByCourse(course);
      
      userState.course = course;
      userState.step = 'select_group';
      userState.groupsPage = 0;

      await this.showGroupsPage(ctx, course, 0);
    } 
    else if (data === 'select_event_for_certificate') {
      await this.handleSelectEventForCertificate(ctx);
    } 
    else if (data.startsWith('certificate_events_page:')) {
      const page = parseInt(data.split(':')[1]);
      await this.showEventsForCertificateSelection(ctx, page);
    }
    else if (data.startsWith('certificate_event:')) {
      const eventId = parseInt(data.split(':')[1]);
      await this.handleCertificateEventSelection(ctx, eventId);
    }
    else if (data.startsWith('group:')) {
      const groupId = parseInt(data.split(':')[1]);
      const group = this.groupsService.getGroupById(groupId);
      
      if (group && userState.fio) {
        try {
          const student = await this.studentsService.registerStudent({
            telegram_id: telegramId,
            username: ctx.from.username,
            first_name: userState.fio.first_name,
            last_name: userState.fio.last_name,
            middle_name: userState.fio.middle_name,
            course: userState.course,
            group: group.name,
          });

          this.userStates.delete(telegramId);
          
          await ctx.editMessageText(
            `✅ Регистрация завершена!\n\n` +
            `ФИО: ${student.last_name} ${student.first_name} ${student.middle_name || ''}\n` +
            `Группа: ${student.group}\n` +
            `Курс: ${student.course}\n\n` +
            `Добро пожаловать в систему!`
          );

          await ctx.reply('Теперь вы можете участвовать в мероприятиях!', this.getMainKeyboard());
        } catch (error) {
          await ctx.reply('❌ Произошла ошибка при регистрации.');
        }
      }
    }
    else if (data.startsWith('groups_page:')) {
      const [_, course, page] = data.split(':');
      await this.showGroupsPage(ctx, parseInt(course), parseInt(page));
    }
    else if (data.startsWith('participate:')) {
      const eventId = parseInt(data.split(':')[1]);
      await this.handleParticipation(ctx, eventId);
    } 
    else if (data === 'already_participating') {
      await ctx.reply(
        'ℹ️ Вы уже участвуете в этом мероприятии.\n\n' +
        'Один студент может участвовать в каждом мероприятии только один раз.'
      );
    }
    else if (data === 'edit_fio') {
      this.userStates.set(telegramId, { step: 'editing_fio' });
      await ctx.reply('Введите ваше новое ФИО (например: Иванов Иван Иванович):');
    } 
    else if (data === 'edit_group') {
      await ctx.reply(
        'Выберите ваш курс:',
        Markup.inlineKeyboard([
          [Markup.button.callback('1 курс', 'edit_course:1')],
          [Markup.button.callback('2 курс', 'edit_course:2')],
          [Markup.button.callback('3 курс', 'edit_course:3')],
        ])
      );
    } 
    else if (data.startsWith('edit_course:')) {
      const course = parseInt(data.split(':')[1]);
      await this.showGroupsPageForEdit(ctx, course, 0);
    } 
    else if (data.startsWith('edit_groups_page:')) {
      const [_, course, page] = data.split(':');
      await this.showGroupsPageForEdit(ctx, parseInt(course), parseInt(page));
    }
    else if (data.startsWith('edit_group_select:')) {
      const groupId = parseInt(data.split(':')[1]);
      const group = this.groupsService.getGroupById(groupId);
      
      if (group) {
        try {
          const userState = this.userStates.get(telegramId);
          await this.studentsService.updateStudentProfile(telegramId, {
            course: userState.editingCourse,
            group: group.name,
          });

          this.userStates.delete(telegramId);
          await ctx.editMessageText('✅ Группа успешно обновлена!');
          await this.showProfile(ctx);
        } catch (error) {
          await ctx.reply('❌ Произошла ошибка при обновлении группы.');
        }
      }
    }
  }

  private async showGroupsPage(ctx: Context, course: number, page: number) {
  const groups = this.groupsService.getGroupsByCourse(course);
  const groupsPerPage = 10; // Увеличим до 10 групп на страницу
  const totalPages = Math.ceil(groups.length / groupsPerPage);
  
  const startIndex = page * groupsPerPage;
  const endIndex = startIndex + groupsPerPage;
  const pageGroups = groups.slice(startIndex, endIndex);

  const userState = this.userStates.get(ctx.from!.id);
  if (userState) {
    userState.groupsPage = page;
  }

  // Создаем кнопки групп (2 колонки для лучшего отображения)
  const groupButtons: any[][] = [];
  for (let i = 0; i < pageGroups.length; i += 2) {
    const row: any[] = [];
    if (pageGroups[i]) {
      row.push(Markup.button.callback(pageGroups[i].name, `group:${pageGroups[i].id}`));
    }
    if (pageGroups[i + 1]) {
      row.push(Markup.button.callback(pageGroups[i + 1].name, `group:${pageGroups[i + 1].id}`));
    }
    if (row.length > 0) {
      groupButtons.push(row);
    }
  }

  // Создаем кнопки навигации
  const navigationRow: any[] = [];
  if (page > 0) {
    navigationRow.push(Markup.button.callback('⬅️ Назад', `groups_page:${course}:${page - 1}`));
  }
  
  // Добавляем кнопку "В начало" если много страниц
  if (page > 2) {
    navigationRow.push(Markup.button.callback('🏠 В начало', `groups_page:${course}:0`));
  }
  
  if (page < totalPages - 1) {
    navigationRow.push(Markup.button.callback('Вперед ➡️', `groups_page:${course}:${page + 1}`));
  }
  
  // Добавляем навигацию только если есть кнопки
  if (navigationRow.length > 0) {
    groupButtons.push(navigationRow);
  }

  const messageText = `🎓 Выберите вашу группу\n\n` +
    `Курс: ${course}\n` +
    `Страница: ${page + 1} из ${totalPages}\n` +
    `Всего групп: ${groups.length}`;

  try {
    if ((ctx.callbackQuery as any).message) {
      await ctx.editMessageText(messageText, Markup.inlineKeyboard(groupButtons));
    } else {
      await ctx.reply(messageText, Markup.inlineKeyboard(groupButtons));
    }
  } catch (error) {
    // Если не можем отредактировать сообщение, отправляем новое
    await ctx.reply(messageText, Markup.inlineKeyboard(groupButtons));
  }
}

  private async showGroupsPageForEdit(ctx: Context, course: number, page: number) {
  const groups = this.groupsService.getGroupsByCourse(course);
  const groupsPerPage = 10; // Увеличим до 10 групп на страницу
  const totalPages = Math.ceil(groups.length / groupsPerPage);
  
  const startIndex = page * groupsPerPage;
  const endIndex = startIndex + groupsPerPage;
  const pageGroups = groups.slice(startIndex, endIndex);

  const userState = this.userStates.get(ctx.from!.id);
  if (userState) {
    userState.editingCourse = course;
    userState.groupsPage = page;
  }

  // Создаем кнопки групп (2 колонки)
  const groupButtons: any[][] = [];
  for (let i = 0; i < pageGroups.length; i += 2) {
    const row: any[] = [];
    if (pageGroups[i]) {
      row.push(Markup.button.callback(pageGroups[i].name, `edit_group_select:${pageGroups[i].id}`));
    }
    if (pageGroups[i + 1]) {
      row.push(Markup.button.callback(pageGroups[i + 1].name, `edit_group_select:${pageGroups[i + 1].id}`));
    }
    if (row.length > 0) {
      groupButtons.push(row);
    }
  }

  // Создаем кнопки навигации
  const navigationRow: any[] = [];
  if (page > 0) {
    navigationRow.push(Markup.button.callback('⬅️ Назад', `edit_groups_page:${course}:${page - 1}`));
  }
  
  if (page > 2) {
    navigationRow.push(Markup.button.callback('🏠 В начало', `edit_groups_page:${course}:0`));
  }
  
  if (page < totalPages - 1) {
    navigationRow.push(Markup.button.callback('Вперед ➡️', `edit_groups_page:${course}:${page + 1}`));
  }
  
  if (navigationRow.length > 0) {
    groupButtons.push(navigationRow);
  }

  const messageText = `🎓 Выберите вашу новую группу\n\n` +
    `Курс: ${course}\n` +
    `Страница: ${page + 1} из ${totalPages}\n` +
    `Всего групп: ${groups.length}`;

  try {
    await ctx.editMessageText(messageText, Markup.inlineKeyboard(groupButtons));
  } catch (error) {
    await ctx.reply(messageText, Markup.inlineKeyboard(groupButtons));
  }
}

  async handleProfile(ctx: Context) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    await this.showProfile(ctx);
  }

  async showProfile(ctx: Context) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) return;

    // Гарантируем, что рейтинг отображается корректно
    const rating = student.rating && !isNaN(Number(student.rating)) 
      ? Number(student.rating).toFixed(2) 
      : '3.00';

    await ctx.reply(
      `👤 Ваш профиль:\n\n` +
      `ФИО: ${student.last_name} ${student.first_name} ${student.middle_name || ''}\n` +
      `Группа: ${student.group}\n` +
      `Курс: ${student.course}\n` +
      `Рейтинг: ${rating}/5.0\n\n` +
      `ℹ️ Для изменения данных обратитесь к администратору.`
    );
  }

  async handleEditProfile(ctx: Context) {
    await this.handleProfile(ctx);
  }

  private getMainKeyboard() {
    return Markup.keyboard([
      ['📅 Мои мероприятия', '⭐ Мой рейтинг'],
      ['📊 Все мероприятия', '📎 Отправить сертификат'],
      ['👤 Мой профиль']
    ]).resize();
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

  async handleRating(ctx: Context) {
  if (!ctx.from) return;

  const telegramId = ctx.from.id;
  const student = await this.studentsService.findByTelegramId(telegramId);
  
  if (!student) {
    await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
    return;
  }

  // Получаем ВСЕ участия (включая архивированные) для подсчета
  const participations = await this.participationsService.getStudentParticipations(student.id);
  const approvedCount = participations.filter(p => p.status === 'approved').length;

  const rating = student.rating && !isNaN(Number(student.rating)) 
    ? Number(student.rating) 
    : 3.0;
  
  await ctx.reply(
    `⭐ Ваш рейтинг: ${rating.toFixed(2)}/5.0\n` +
    `✅ Подтвержденных участий: ${approvedCount}\n\n` +
    this.getRatingMessage(rating)
  );
}

  async handleDocument(ctx: Context) {
    if (!ctx.from || !ctx.message || !('document' in ctx.message)) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);
    
    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    const fileId = ctx.message.document.file_id;
    const fileName = ctx.message.document.file_name || 'Неизвестный файл';
    const fileSize = ctx.message.document.file_size;
    
    // Проверяем размер файла (максимум 20MB)
    if (fileSize && fileSize > 20 * 1024 * 1024) {
      await ctx.reply('❌ Файл слишком большой. Максимальный размер: 20MB');
      return;
    }

    const userState = this.userStates.get(telegramId);
    
    if (userState && userState.step === 'waiting_event_certificate' && userState.selectedEventId) {
      // Это сертификат для конкретного мероприятия (из кнопки "Участвовал")
      await this.handleEventCertificate(ctx, userState.selectedEventId, fileId, fileName);
    } else {
      // Это общая загрузка сертификата (из кнопки "Отправить сертификат")
      await this.handleGeneralCertificate(ctx, fileId, fileName);
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

      // Очищаем состояние
      this.userStates.delete(telegramId);

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

  private async handleGeneralCertificate(ctx: Context, fileId: string, fileName: string) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;

    // Сохраняем file_id в состоянии пользователя
    this.userStates.set(telegramId, { 
      step: 'certificate_uploaded',
      action: 'upload_certificate',
      certificateFileId: fileId,
      certificateFileName: fileName
    });

    await ctx.reply(
      `✅ Сертификат "${fileName}" успешно загружен!\n\n` +
      `Теперь выберите мероприятие, к которому относится этот сертификат:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📅 Выбрать мероприятие', 'select_event_for_certificate')]
      ])
    );
  }

  private async handleSelectEventForCertificate(ctx: Context) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const userState = this.userStates.get(telegramId);
    
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

  private async showEventsForCertificateSelection(ctx: Context, page: number = 0) {
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

  private async handleCertificateEventSelection(ctx: Context, eventId: number) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const userState = this.userStates.get(telegramId);
    
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

      // Очищаем состояние
      this.userStates.delete(telegramId);

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

  private async handleParticipation(ctx: Context, eventId: number) {
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
    const userState = this.userStates.get(telegramId) || {};
    userState.selectedEventId = eventId;
    userState.step = 'waiting_event_certificate';
    this.userStates.set(telegramId, userState);
  }

  private getRatingMessage(rating: number): string {
    if (rating < 3) {
      return '⚠️ Ваш рейтинг ниже 3.0! Примите участие в мероприятиях, чтобы повысить рейтинг.';
    } else if (rating < 4) {
      return '📈 Хороший результат! Продолжайте участвовать в мероприятиях.';
    } else {
      return '🎉 Отличный рейтинг! Так держать!';
    }
  }

  // НОВЫЕ МЕТОДЫ ДЛЯ УВЕДОМЛЕНИЙ И СТАТИСТИКИ

  /**
   * Уведомление студента об изменении статуса участия
   */
  async notifyStatusChange(participation: Participation, oldStatus: string): Promise<void> {
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
            // Проверяем, не участвует ли уже студент
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
              
              // Задержка чтобы не превысить лимиты Telegram (20 сообщений в секунду)
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
  private async handleStats(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    // Проверяем, является ли пользователь администратором
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
  private async handleApplyPenalties(ctx: Context): Promise<void> {
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
}