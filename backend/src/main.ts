import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import * as helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('frontend.url');
  const port = configService.get<number>('port');
  const isProduction = configService.get('NODE_ENV') === 'production';

  app.enableCors({
    origin: frontendUrl || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Serve locally uploaded files (fallback when S3 is not configured)
  const { join } = await import('path');
  const { mkdirSync } = await import('fs');
  const uploadsPath = join(process.cwd(), 'public', 'uploads');
  mkdirSync(uploadsPath, { recursive: true });
  app.use('/uploads', require('express').static(uploadsPath));

  app.use((helmet as any)());
  app.use((compression as any)());
  // H1 + C2: cookie-parser required for httpOnly refresh token cookie
  app.use((cookieParser as any)());

  // Allow larger JSON bodies for base64 image uploads (cover images)
  // Images are compressed client-side before upload — 10MB is a safe ceiling
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useWebSocketAdapter(new IoAdapter(app));

  // H1: Swagger only in non-production environments
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ticketing Platform API')
      .setDescription('Secure event ticketing platform with RSA-signed QR codes, 2FA, and real-time validation')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Auth', 'Authentication and authorization endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Events', 'Event management endpoints')
      .addTag('Tickets', 'Ticket management endpoints')
      .addTag('Controllers', 'Controller management endpoints')
      .addTag('Validation', 'Ticket scanning and validation endpoints')
      .addTag('Analytics', 'Analytics and reporting endpoints')
      .addTag('Audit', 'Audit log endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: false },
    });
    logger.log(`Swagger docs available at: http://localhost:${port || 3001}/api/docs`);
  }

  await app.listen(port || 3001);
  logger.log(`Application running on: http://localhost:${port || 3001} [${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
}

bootstrap();
