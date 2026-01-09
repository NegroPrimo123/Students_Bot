import { Injectable, UnauthorizedException, Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminsService } from '../admins/admins.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private adminsService: AdminsService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    // При запуске создаем/обновляем тестового админа
    try {
      await this.adminsService.createOrUpdateTestAdmin();
      this.logger.log('✅ Test admin initialized');
    } catch (error) {
      this.logger.error('Failed to initialize test admin:', error);
    }
  }

  async validateAdmin(email: string, password: string): Promise<any> {
    this.logger.log(`🔑 Login attempt: ${email}`);
    
    // ГАРАНТИРОВАННАЯ проверка для тестирования
    if (email === 'admin@college.edu' && password === 'admin123') {
      this.logger.log('✅ Test credentials accepted');
      
      let admin = await this.adminsService.findByEmail(email);
      
      if (!admin) {
        this.logger.warn('Admin not in DB, creating...');
        admin = await this.adminsService.createOrUpdateTestAdmin();
      }
      
      await this.adminsService.updateLastLogin(admin.id);
      
      // Убираем пароль из ответа
      const { password_hash, ...result } = admin;
      return result;
    }
    
    // Для остальных случаев
    try {
      const admin = await this.adminsService.findByEmail(email);
      
      if (!admin) {
        this.logger.warn(`Admin not found: ${email}`);
        throw new UnauthorizedException('Неверные учетные данные');
      }
      
      const isValid = await this.adminsService.checkPassword(admin, password);
      
      if (!isValid) {
        this.logger.warn(`Invalid password for: ${email}`);
        throw new UnauthorizedException('Неверные учетные данные');
      }
      
      await this.adminsService.updateLastLogin(admin.id);
      
      const { password_hash, ...result } = admin;
      return result;
      
    } catch (error) {
      this.logger.error(`Validation error for ${email}:`, error);
      throw new UnauthorizedException('Неверные учетные данные');
    }
  }

  async login(admin: any) {
    const payload = { 
      email: admin.email, 
      sub: admin.id,
      name: admin.full_name,
      telegramId: admin.telegram_id 
    };

    this.logger.log(`✅ Generating JWT for admin ${admin.id}`);

    const token = this.jwtService.sign(payload, {
      secret: 'dev-secret-key-change-in-production',
      expiresIn: '24h'
    });

    return {
      access_token: token,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        telegram_id: admin.telegram_id,
        username: admin.username,
      }
    };
  }
}