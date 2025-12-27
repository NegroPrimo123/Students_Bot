import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { TextHandler } from './handlers/TextHandler';
import { CallbackHandler } from './handlers/CallbackHandler';
import { DocumentHandler } from './handlers/DocumentHandler';
import { RegistrationService } from './RegistrationService';
import { StudentsService } from '../students/students.service';
import { EventsService } from '../events/events.service';
import { ParticipationsService } from '../participations/participations.service';
import { GroupsService } from '../groups/groups.service';
import { StatisticsService } from '../statistics/statistics.service';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private readonly bot: Telegraf;

  constructor(
    private configService: ConfigService,
    private textHandler: TextHandler,
    private callbackHandler: CallbackHandler,
    private documentHandler: DocumentHandler,
    private registrationService: RegistrationService,
    private studentsService: StudentsService,
    private eventsService: EventsService,
    private participationsService: ParticipationsService,
    private groupsService: GroupsService,
    private statisticsService: StatisticsService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error('❌ TELEGRAM_BOT_TOKEN is not defined in .env file');
      return;
    }

    try {
      this.bot = new Telegraf(token);
      this.setupHandlers();
      this.setupErrorHandler();
      this.logger.log('✅ Bot instance created');
    } catch (error) {
      this.logger.error('❌ Bot creation failed:', error);
    }
  }

  private setupHandlers(): void {
    this.bot.start(this.handleStart.bind(this));
    this.bot.command('events', this.handleEvents.bind(this));
    this.bot.command('rating', this.handleRating.bind(this));
    this.bot.command('profile', this.handleProfile.bind(this));
    this.bot.command('edit_profile', this.handleEditProfile.bind(this));
    this.bot.command('stats', this.handleStats.bind(this));
    this.bot.command('apply_penalties', this.handleApplyPenalties.bind(this));
    
    this.bot.on('document', this.documentHandler.handle.bind(this.documentHandler));
    this.bot.on('callback_query', this.callbackHandler.handle.bind(this.callbackHandler));
    this.bot.on('text', this.textHandler.handle.bind(this.textHandler));
  }

  private setupErrorHandler(): void {
    this.bot.catch((error: Error, ctx: Context) => {
      this.logger.error(`Bot error for user ${ctx.from?.id}:`, error);
      ctx.reply('❌ Произошла внутренняя ошибка. Попробуйте позже.').catch(() => {});
    });
  }

  async handleStart(ctx: Context): Promise<void> {
    await this.registrationService.handleStart(ctx);
  }

  async handleEvents(ctx: Context): Promise<void> {
    await this.textHandler.handleEvents(ctx);
  }

  async handleProfile(ctx: Context): Promise<void> {
    await this.registrationService.handleProfile(ctx);
  }

  async handleEditProfile(ctx: Context): Promise<void> {
    await this.registrationService.handleEditProfile(ctx);
  }

  async handleRating(ctx: Context): Promise<void> {
    await this.registrationService.handleRating(ctx);
  }

  async handleStats(ctx: Context): Promise<void> {
    // Используем NotificationService через отдельный сервис или напрямую
    // Для простоты можно вызвать через StudentsService или создать отдельный обработчик
    await ctx.reply('Для просмотра статистики используйте веб-интерфейс администратора.');
  }

  async handleApplyPenalties(ctx: Context): Promise<void> {
    await ctx.reply('Применение штрафов доступно только через веб-интерфейс администратора.');
  }

  async onModuleInit(): Promise<void> {
    this.startPolling();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopBot();
  }

  async startPolling(): Promise<void> {
    try {
      this.bot.launch().then(() => {
        this.logger.log('✅ Bot started successfully!');
      }).catch(error => {
        this.logger.error('❌ Bot failed to start:', error);
      });
      
      this.logger.log('🤖 Bot is starting in background...');
    } catch (error) {
      this.logger.error('❌ Bot startup error:', error);
    }
  }

  async stopBot(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.logger.log('🛑 Bot stopped');
    }
  }

  getBotInstance(): Telegraf {
    return this.bot;
  }
}