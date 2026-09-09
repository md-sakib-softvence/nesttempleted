import { Module, Global } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { MailService } from './mail.service';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST') || 'localhost',
          port: parseInt(configService.get<string>('MAIL_PORT') || '587', 10),
          secure: configService.get<string>('MAIL_PORT') === '465',
          auth: {
            user: configService.get<string>('MAIL_USER') || 'user',
            pass: configService.get<string>('MAIL_PASS') || 'pass',
          },
        },
        defaults: {
          from: '"No Reply" <noreply@example.com>',
        },
        template: {
          dir: join(__dirname, 'templates'), // This might need adjustment based on build output
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
