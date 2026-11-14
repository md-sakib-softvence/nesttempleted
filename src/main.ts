import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Config
  const port = configService.get<number>('app.port');
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api/v1';

  // Global settings
  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger setup
  const swaggerPath = `${apiPrefix}/docs`;
  const config = new DocumentBuilder()
    .setTitle('Aimalya API')
    .setDescription('The Aimalya API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const displayPort = port || 3000;

  await app.listen(displayPort);
  logger.log(
    `🚀 Application is running on: http://localhost:${displayPort}/${apiPrefix}`,
  );
  logger.log(
    `📚 Swagger documentation: http://localhost:${displayPort}/${swaggerPath}`,
  );
}
void bootstrap();
