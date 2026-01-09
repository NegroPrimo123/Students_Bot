import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { CertificateService } from '../CertificateService';
import { StudentsService } from '../../students/students.service';
import { StateService } from '../state.service';
import { FILE_SIZE_LIMIT, ALLOWED_FILE_TYPES, ALLOWED_FILE_EXTENSIONS } from '../constants';
import { UserState } from '../interfaces';

@Injectable()
export class DocumentHandler {
  private readonly logger = new Logger(DocumentHandler.name);

  constructor(
    private certificateService: CertificateService,
    private studentsService: StudentsService,
    private stateService: StateService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    if (!ctx.from || !ctx.message || !('document' in ctx.message)) return;

    const telegramId = ctx.from.id;
    const student = await this.studentsService.findByTelegramId(telegramId);

    if (!student) {
      await ctx.reply('Сначала зарегистрируйтесь с помощью /start');
      return;
    }

    const document = ctx.message.document;
    const fileId = document.file_id;
    const fileName = document.file_name || 'Неизвестный файл';
    const fileSize = document.file_size;
    const mimeType = document.mime_type;

    // Валидация файла
    if (!this.validateFile(fileName, fileSize, mimeType)) {
      await ctx.reply(
        '❌ Недопустимый файл.\n\n' +
        'Разрешены только: PDF, JPG, PNG\n' +
        'Максимальный размер: 20MB'
      );
      return;
    }

    const userState = this.stateService.ensureUserState(telegramId);
    await this.certificateService.handleDocument(ctx, userState, fileId, fileName, fileSize);
  }

  private validateFile(fileName: string, fileSize?: number, mimeType?: string): boolean {
    // Проверка размера
    if (fileSize && fileSize > FILE_SIZE_LIMIT) {
      return false;
    }

    // Проверка расширения
    const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
      return false;
    }

    // Проверка MIME-типа если есть
    if (mimeType && !ALLOWED_FILE_TYPES.includes(mimeType)) {
      return false;
    }

    return true;
  }
}