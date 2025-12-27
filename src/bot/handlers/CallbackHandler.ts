import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { RegistrationService } from '../RegistrationService';
import { CertificateService } from '../CertificateService';
import { StateService } from '../state.service';
import { CallbackAction } from '../constants';

@Injectable()
export class CallbackHandler {
  private readonly logger = new Logger(CallbackHandler.name);

  constructor(
    private registrationService: RegistrationService,
    private certificateService: CertificateService,
    private stateService: StateService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery) || !ctx.from) {
      return;
    }

    const data = (ctx.callbackQuery as any).data;
    const telegramId = ctx.from.id;
    const userState = this.stateService.ensureUserState(telegramId);

    try {
      if (data.startsWith(CallbackAction.COURSE) ||
          data.startsWith(CallbackAction.GROUP) ||
          data.startsWith(CallbackAction.GROUPS_PAGE) ||
          data.includes('edit_')) {
        await this.registrationService.handleCallback(ctx, data, userState);
      } else if (data === CallbackAction.SELECT_EVENT_FOR_CERTIFICATE) {
        await this.certificateService.handleSelectEventForCertificate(ctx, userState);
      } else if (data.startsWith(CallbackAction.CERTIFICATE_EVENTS_PAGE)) {
        const page = parseInt(data.split(':')[1]);
        await this.certificateService.showEventsForCertificateSelection(ctx, page);
      } else if (data.startsWith(CallbackAction.CERTIFICATE_EVENT)) {
        const eventId = parseInt(data.split(':')[1]);
        await this.certificateService.handleCertificateEventSelection(ctx, eventId, userState);
      } else if (data.startsWith(CallbackAction.PARTICIPATE)) {
        const eventId = parseInt(data.split(':')[1]);
        await this.certificateService.handleParticipation(ctx, eventId, userState);
      } else if (data === CallbackAction.ALREADY_PARTICIPATING) {
        await ctx.reply(
          'ℹ️ Вы уже участвуете в этом мероприятии.\n\n' +
          'Один студент может участвовать в каждом мероприятии только один раз.'
        );
      }
    } catch (error) {
      this.logger.error(`Callback handling error: ${error.message}`, error.stack);
      await ctx.reply('❌ Произошла ошибка при обработке запроса. Попробуйте ещё раз.');
    }
  }
}