import { Injectable, Logger } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { StudentsService } from '../students/students.service';
import { GroupsService } from '../groups/groups.service';
import { ParticipationsService } from '../participations/participations.service'; 

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);
  private userStates = new Map<number, any>();

  constructor(
    private studentsService: StudentsService,
    private groupsService: GroupsService,
    private participationsService: ParticipationsService, 
  ) {}

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

  async handleText(ctx: Context, text: string) {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;

    // Обработка команд из клавиатуры
    switch (text) {
      case '👤 Мой профиль':
        await this.handleProfile(ctx);
        break;
      
      case '📊 Все мероприятия':
        // Обработка в другом сервисе
        break;
      
      case '📎 Отправить сертификат':
        // Обработка в CertificateService
        break;
      
      case '⭐ Мой рейтинг':
        await this.handleRating(ctx);
        break;
      
      case '📅 Мои мероприятия':
        // Обработка в другом сервисе
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

  async handleCallback(ctx: Context, data: string) {
    if (!ctx.from) return;

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
    const groupsPerPage = 10;
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
    const groupsPerPage = 10;
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

    // Гарантируем, что рейтинг отображается корректно
    const rating = student.rating && !isNaN(Number(student.rating)) 
      ? Number(student.rating).toFixed(2) 
      : '3.00';

    await ctx.reply(
      `👤 Ваш профиль:\n\n` +
      `Telegram ID: ${telegramId}\n` +  // Изменено: показываем Telegram ID вместо ID студента из БД
      `ФИО: ${student.last_name} ${student.first_name} ${student.middle_name || ''}\n` +
      `Группа: ${student.group}\n` +
      `Курс: ${student.course}\n` +
      `Рейтинг: ${rating}/5.0\n\n` +
      `ℹ️ Для изменения данных обратитесь к администратору.`
    );
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
      `🆔 Telegram ID: ${telegramId}\n` +  // Изменено: показываем Telegram ID вместо ID студента из БД
      `ФИО: ${student.last_name} ${student.first_name} ${student.middle_name || ''}\n` +
      `👥 Группа: ${student.group}\n` +
      `🎓 Курс: ${student.course}\n` +
      `⭐ Рейтинг: ${rating}/5.0\n\n` +
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

  private getRatingMessage(rating: number): string {
    if (rating < 3) {
      return '⚠️ Ваш рейтинг ниже 3.0! Примите участие в мероприятиях, чтобы повысить рейтинг.';
    } else if (rating < 4) {
      return '📈 Хороший результат! Продолжайте участвовать в мероприятиях.';
    } else {
      return '🎉 Отличный рейтинг! Так держать!';
    }
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
