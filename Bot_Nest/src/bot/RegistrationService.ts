import { Injectable, Logger } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { StudentsService } from '../students/students.service';
import { GroupsService } from '../groups/groups.service';
import { ParticipationsService } from '../participations/participations.service';
import { EventsService } from '../events/events.service';
import { StateService } from './state.service';
import { UserState, StudentData } from './interfaces';
import { UserStep, CallbackAction, GROUPS_PER_PAGE } from './constants';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private studentsService: StudentsService,
    private groupsService: GroupsService,
    private participationsService: ParticipationsService,
    private eventsService: EventsService,
    private stateService: StateService,
  ) {}

  async handleStart(ctx: Context): Promise<void> {
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

    this.stateService.setUserState(telegramId, { step: UserStep.REGISTRATION });
    await ctx.reply(
      'Добро пожаловать! Для регистрации введите ваше ФИО (например: Иванов Иван Иванович):'
    );
  }

  async handleText(ctx: Context, text: string, userState?: UserState): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const currentState = userState || this.stateService.getUserState(telegramId);

    if (currentState?.step === UserStep.REGISTRATION && !currentState.fio) {
      await this.handleFioInput(ctx, text);
    } else if (currentState?.step === UserStep.EDITING_FIO) {
      await this.handleFioEdit(ctx, text);
    }
  }

  private async handleFioInput(ctx: Context, text: string): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const fioParts = text.trim().split(' ').filter(part => part.length > 0);

    if (fioParts.length < 2) {
      await ctx.reply('Пожалуйста, введите ФИО полностью (например: Иванов Иван Иванович):');
      return;
    }

    if (fioParts.some(part => !/^[а-яА-ЯёЁa-zA-Z-]+$/.test(part))) {
      await ctx.reply('❌ ФИО может содержать только буквы и дефисы. Попробуйте снова:');
      return;
    }

    this.stateService.updateUserState(telegramId, {
      fio: {
        last_name: fioParts[0],
        first_name: fioParts[1],
        middle_name: fioParts[2] || null
      },
      step: UserStep.SELECT_COURSE
    });

    await ctx.reply(
      'Отлично! Теперь выберите ваш курс:',
      Markup.inlineKeyboard([
        [Markup.button.callback('1 курс', `${CallbackAction.COURSE}:1`)],
        [Markup.button.callback('2 курс', `${CallbackAction.COURSE}:2`)],
        [Markup.button.callback('3 курс', `${CallbackAction.COURSE}:3`)],
      ])
    );
  }

  private async handleFioEdit(ctx: Context, text: string): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const fioParts = text.trim().split(' ').filter(part => part.length > 0);

    if (fioParts.length < 2) {
      await ctx.reply('Пожалуйста, введите ФИО полностью (например: Иванов Иван Иванович):');
      return;
    }

    try {
      await this.studentsService.updateStudentProfile(telegramId, {
        last_name: fioParts[0],
        first_name: fioParts[1],
        middle_name: fioParts[2] || undefined
      });

      this.stateService.deleteUserState(telegramId);
      await ctx.reply('✅ ФИО успешно обновлено!', this.getMainKeyboard());
    } catch (error) {
      this.logger.error(`Error updating profile for ${telegramId}:`, error);
      await ctx.reply('❌ Произошла ошибка при обновлении профиля.');
    }
  }

  async handleCallback(ctx: Context, data: string, userState: UserState): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;

    if (data.startsWith(CallbackAction.COURSE)) {
      const course = parseInt(data.split(':')[1]);
      await this.handleCourseSelection(ctx, course);
    } else if (data.startsWith(CallbackAction.GROUP)) {
      const groupId = parseInt(data.split(':')[1]);
      await this.handleGroupSelection(ctx, groupId, userState);
    } else if (data.startsWith(CallbackAction.GROUPS_PAGE)) {
      const parts = data.split(':');
      const course = parseInt(parts[1]);
      const page = parseInt(parts[2]);
      await this.showGroupsPage(ctx, course, page);
    } else if (data === CallbackAction.EDIT_FIO) {
      await this.handleEditFio(ctx);
    } else if (data === CallbackAction.EDIT_GROUP) {
      await this.handleEditGroup(ctx);
    } else if (data.startsWith(CallbackAction.EDIT_COURSE)) {
      const course = parseInt(data.split(':')[1]);
      await this.showGroupsPageForEdit(ctx, course, 0);
    } else if (data.startsWith(CallbackAction.EDIT_GROUPS_PAGE)) {
      const parts = data.split(':');
      const course = parseInt(parts[1]);
      const page = parseInt(parts[2]);
      await this.showGroupsPageForEdit(ctx, course, page);
    } else if (data.startsWith(CallbackAction.EDIT_GROUP_SELECT)) {
      const groupId = parseInt(data.split(':')[1]);
      await this.handleEditGroupSelection(ctx, groupId, userState);
    }
  }

  private async handleCourseSelection(ctx: Context, course: number): Promise<void> {
    if (!ctx.from) return;

    this.stateService.updateUserState(ctx.from.id, {
      course,
      step: UserStep.SELECT_GROUP
    });

    await this.showGroupsPage(ctx, course, 0);
  }

  private async handleGroupSelection(ctx: Context, groupId: number, userState: UserState): Promise<void> {
    if (!ctx.from || !userState.fio) return;

    const group = this.groupsService.getGroupById(groupId);

    if (group && userState.fio) {
      try {
        const studentData: StudentData = {
          telegram_id: ctx.from.id,
          username: ctx.from.username,
          first_name: userState.fio.first_name,
          last_name: userState.fio.last_name,
          middle_name: userState.fio.middle_name || undefined,
          course: userState.course!,
          group: group.name,
        };

        const student = await this.studentsService.registerStudent(studentData);
        this.stateService.deleteUserState(ctx.from.id);

        await ctx.editMessageText(
          `✅ Регистрация завершена!\n\n` +
          `ФИО: ${student.last_name} ${student.first_name} ${student.middle_name || ''}\n` +
          `Группа: ${student.group}\n` +
          `Курс: ${student.course}\n\n` +
          `Добро пожаловать в систему!`
        );

        await ctx.reply('Теперь вы можете участвовать в мероприятиях!', this.getMainKeyboard());
      } catch (error) {
        this.logger.error(`Registration error for user ${ctx.from.id}:`, error);
        await ctx.reply('❌ Произошла ошибка при регистрации.');
      }
    }
  }

  private async handleEditFio(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    this.stateService.setUserState(ctx.from.id, { step: UserStep.EDITING_FIO });
    await ctx.reply('Введите ваше новое ФИО (например: Иванов Иван Иванович):');
  }

  private async handleEditGroup(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    await ctx.reply(
      'Выберите ваш курс:',
      Markup.inlineKeyboard([
        [Markup.button.callback('1 курс', `${CallbackAction.EDIT_COURSE}:1`)],
        [Markup.button.callback('2 курс', `${CallbackAction.EDIT_COURSE}:2`)],
        [Markup.button.callback('3 курс', `${CallbackAction.EDIT_COURSE}:3`)],
      ])
    );
  }

  private async handleEditGroupSelection(ctx: Context, groupId: number, userState: UserState): Promise<void> {
    if (!ctx.from) return;

    const group = this.groupsService.getGroupById(groupId);

    if (group) {
      try {
        await this.studentsService.updateStudentProfile(ctx.from.id, {
          course: userState.editingCourse,
          group: group.name,
        });

        this.stateService.deleteUserState(ctx.from.id);
        await ctx.editMessageText('✅ Группа успешно обновлена!');
        await this.showProfile(ctx);
      } catch (error) {
        this.logger.error(`Error updating group for user ${ctx.from.id}:`, error);
        await ctx.reply('❌ Произошла ошибка при обновлении группы.');
      }
    }
  }

  private async showGroupsPage(ctx: Context, course: number, page: number): Promise<void> {
    const groups = this.groupsService.getGroupsByCourse(course);
    const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE);

    const startIndex = page * GROUPS_PER_PAGE;
    const endIndex = startIndex + GROUPS_PER_PAGE;
    const pageGroups = groups.slice(startIndex, endIndex);

    // Создаем кнопки групп (2 колонки)
    const groupButtons: any[][] = [];
    for (let i = 0; i < pageGroups.length; i += 2) {
      const row: any[] = [];
      if (pageGroups[i]) {
        row.push(Markup.button.callback(pageGroups[i].name, `${CallbackAction.GROUP}:${pageGroups[i].id}`));
      }
      if (pageGroups[i + 1]) {
        row.push(Markup.button.callback(pageGroups[i + 1].name, `${CallbackAction.GROUP}:${pageGroups[i + 1].id}`));
      }
      if (row.length > 0) {
        groupButtons.push(row);
      }
    }

    // Навигация
    const navigationRow: any[] = [];
    if (page > 0) {
      navigationRow.push(Markup.button.callback('⬅️ Назад', `${CallbackAction.GROUPS_PAGE}:${course}:${page - 1}`));
    }
    if (page > 2) {
      navigationRow.push(Markup.button.callback('🏠 В начало', `${CallbackAction.GROUPS_PAGE}:${course}:0`));
    }
    if (page < totalPages - 1) {
      navigationRow.push(Markup.button.callback('Вперед ➡️', `${CallbackAction.GROUPS_PAGE}:${course}:${page + 1}`));
    }
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
      await ctx.reply(messageText, Markup.inlineKeyboard(groupButtons));
    }
  }

  private async showGroupsPageForEdit(ctx: Context, course: number, page: number): Promise<void> {
    const groups = this.groupsService.getGroupsByCourse(course);
    const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE);

    const startIndex = page * GROUPS_PER_PAGE;
    const endIndex = startIndex + GROUPS_PER_PAGE;
    const pageGroups = groups.slice(startIndex, endIndex);

    this.stateService.updateUserState(ctx.from!.id, {
      editingCourse: course,
      groupsPage: page
    });

    // Создаем кнопки групп (2 колонки)
    const groupButtons: any[][] = [];
    for (let i = 0; i < pageGroups.length; i += 2) {
      const row: any[] = [];
      if (pageGroups[i]) {
        row.push(Markup.button.callback(pageGroups[i].name, `${CallbackAction.EDIT_GROUP_SELECT}:${pageGroups[i].id}`));
      }
      if (pageGroups[i + 1]) {
        row.push(Markup.button.callback(pageGroups[i + 1].name, `${CallbackAction.EDIT_GROUP_SELECT}:${pageGroups[i + 1].id}`));
      }
      if (row.length > 0) {
        groupButtons.push(row);
      }
    }

    // Навигация
    const navigationRow: any[] = [];
    if (page > 0) {
      navigationRow.push(Markup.button.callback('⬅️ Назад', `${CallbackAction.EDIT_GROUPS_PAGE}:${course}:${page - 1}`));
    }
    if (page > 2) {
      navigationRow.push(Markup.button.callback('🏠 В начало', `${CallbackAction.EDIT_GROUPS_PAGE}:${course}:0`));
    }
    if (page < totalPages - 1) {
      navigationRow.push(Markup.button.callback('Вперед ➡️', `${CallbackAction.EDIT_GROUPS_PAGE}:${course}:${page + 1}`));
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

  async handleProfile(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    const rating = this.formatRating(student.rating);
    await ctx.reply(
      `👤 Ваш профиль:\n\n` +
      `Telegram ID: ${telegramId}\n` +
      `ФИО: ${student.last_name} ${student.first_name} ${student.middle_name || ''}\n` +
      `Группа: ${student.group}\n` +
      `Курс: ${student.course}\n` +
      `Рейтинг: ${rating}/5.0\n\n` +
      `ℹ️ Для изменения данных обратитесь к администратору.`
    );
  }

  async showProfile(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) return;

    const rating = this.formatRating(student.rating);
    await ctx.reply(
      `👤 Ваш профиль:\n\n` +
      `🆔 Telegram ID: ${telegramId}\n` +
      `ФИО: ${student.last_name} ${student.first_name} ${student.middle_name || ''}\n` +
      `👥 Группа: ${student.group}\n` +
      `🎓 Курс: ${student.course}\n` +
      `⭐ Рейтинг: ${rating}/5.0\n\n` +
      `ℹ️ Для изменения данных обратитесь к администратору.`
    );
  }

  async handleEditProfile(ctx: Context): Promise<void> {
    await this.handleProfile(ctx);
  }

  async handleRating(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    const participations = await this.participationsService.getStudentParticipations(student.id);
    const approvedCount = participations.filter(p => p.status === 'approved').length;
    const rating = this.formatRating(student.rating, false) as number;

    await ctx.reply(
      `⭐ Ваш рейтинг: ${rating.toFixed(2)}/5.0\n` +
      `✅ Подтвержденных участий: ${approvedCount}\n\n` +
      this.getRatingMessage(rating)
    );
  }

  async showEventsWithParticipation(ctx: Context, studentId: number): Promise<void> {
    const student = await this.studentsService.findById(studentId);
    if (!student) return;

    const events = await this.eventsService.getEventsByCourse(student.course);

    if (events.length === 0) {
      await ctx.reply('На вашем курсе пока нет мероприятий.');
      return;
    }

    // Получаем все участия одним запросом (используем существующий метод)
    const existingParticipations = await this.participationsService.getStudentParticipations(student.id);
    const participatingEventIds = new Set(existingParticipations.map(p => p.event.id)); // Исправлено здесь

    for (const event of events) {
      const isParticipating = participatingEventIds.has(event.id);
      
      let buttonText = 'Участвовать ✅';
      let callbackData = `${CallbackAction.PARTICIPATE}:${event.id}`;
      
      if (isParticipating) {
        buttonText = '✅ Уже участвуете';
        callbackData = CallbackAction.ALREADY_PARTICIPATING;
      }

      const buttons = [Markup.button.callback(buttonText, callbackData)];
      
      await ctx.reply(
        `📅 ${event.title}\n\n${event.description}\n\nБаллы: ${event.points_awarded}`,
        Markup.inlineKeyboard(buttons)
      );
    }
  }

  async showStudentParticipations(ctx: Context, studentId: number): Promise<void> {
    const participations = await this.participationsService.getStudentParticipations(studentId);

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

  private getMainKeyboard() {
    return Markup.keyboard([
      ['📅 Мои мероприятия', '⭐ Мой рейтинг'],
      ['📊 Все мероприятия', '📎 Отправить сертификат'],
      ['👤 Мой профиль']
    ]).resize();
  }

  private formatRating(rating: any, asString: boolean = true): string | number {
    const numericRating = rating && !isNaN(Number(rating)) ? Number(rating) : 3.0;
    return asString ? numericRating.toFixed(2) : numericRating;
  }

  private getRatingMessage(rating: number): string {
    if (rating < 3) {
      return '⚠️ Ваш рейтинг ниже 3.0! Примите участие в мероприятиях, чтобы повысить рейтинг. Если не хотите вылететь из колледжа ;)';
    } else if (rating < 4) {
      return '📈 Хороший результат! Продолжайте участвовать в мероприятиях.';
    } else {
      return '🎉 Отличный рейтинг! Так держать!';
    }
  }

  private getStatusText(status: string): string {
    const statusMap = {
      'pending': 'Ожидает проверки',
      'approved': 'Подтверждено',
      'rejected': 'Отклонено'
    };
    return statusMap[status] || status;
  }
}