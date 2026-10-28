import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import paystackConfig from './config/paystack.config';
import flutterwaveConfig from './config/flutterwave.config';
import { PrismaModule } from './prisma/prisma.module';
import { NotificationModule } from './modules/notification/notification.module';
import { MailModule } from './modules/mail/mail.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { FanModule } from './modules/fan/fan.module';
import { PlayerModule } from './modules/player/player.module';
import { MarketingDataModule } from './modules/marketing-data/marketing-data.module';
import { SystemModule } from './modules/system/system.module';
import { TournamentModule } from './modules/tournament/tournament.module';
import { AnnouncementModule } from './modules/announcement/announcement.module';
import { PaymentModule } from './modules/payment/payment.module';
import { FlutterwaveModule } from './modules/flutterwave/flutterwave.module';
import { SeriesModule } from './modules/series/series.module';
import { TicketModule } from './modules/ticket/ticket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        paystackConfig,
        flutterwaveConfig,
      ],
      envFilePath: ['.env.local', '.env'],
    }),
    MailModule,
    NotificationModule,
    PrismaModule,
    TournamentModule,
    SeriesModule,
    TicketModule,
    AdminModule,
    AuthModule,
    EmployeeModule,
    FanModule,
    PlayerModule,
    MarketingDataModule,
    SystemModule,
    AnnouncementModule,
    PaymentModule,
    FlutterwaveModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
