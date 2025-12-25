import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Student Bot API')
    .setDescription('API для управления студенческими мероприятиями')
    .setVersion('1.0')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  
  // Явно запускаем сервер
  await app.listen(3000);
  
  console.log('='.repeat(50));
  console.log('🚀 APPLICATION SUCCESSFULLY STARTED!');
  console.log('📚 Swagger: http://localhost:3000/api');
  console.log('🔍 API Root: http://localhost:3000');
  console.log('🎯 Events: http://localhost:3000/events');
  console.log('='.repeat(50));
}

bootstrap().catch(error => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});