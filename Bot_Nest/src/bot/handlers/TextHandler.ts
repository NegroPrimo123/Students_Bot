import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { RegistrationService } from '../RegistrationService';
import { CertificateService } from '../CertificateService';
import { StudentsService } from '../../students/students.service';
import { EventsService } from '../../events/events.service';
import { ParticipationsService } from '../../participations/participations.service';
import { StateService } from '../state.service';

@Injectable()
export class TextHandler {
  private readonly logger = new Logger(TextHandler.name);

  constructor(
    private registrationService: RegistrationService,
    private certificateService: CertificateService,
    private studentsService: StudentsService,
    private eventsService: EventsService,
    private participationsService: ParticipationsService,
    private stateService: StateService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

    const telegramId = ctx.from.id;
    const text = ctx.message.text;
    const userState = this.stateService.getUserState(telegramId);

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
        await this.registrationService.handleText(ctx, text, userState);
        break;
    }
  }

  async handleEvents(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    await this.registrationService.showEventsWithParticipation(ctx, student.id);
  }

  async handleMyEvents(ctx: Context): Promise<void> {
    if (!ctx.from) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    await this.registrationService.showStudentParticipations(ctx, student.id);
  }
}