import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendVerificationCode(email: string, code: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Welcome to Esports - Verify Your Email',
      template: './verification', // path to template file
      context: {
        code,
      },
    });
  }

  async sendPasswordReset(email: string, code: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Esports - Password Reset Request',
      template: './password-reset',
      context: {
        code,
      },
    });
  }

  async sendRecoveryLink(email: string, token: string) {
    console.log(`[MAILER] Preparing to send recovery link to: ${email}`);
    // Note: Assuming there is a recovery template, or we'll just send a direct URL link.
    // In a real app, the token should be included in a query parameter of a frontend URL.
    const recoveryUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/recover?token=${token}`;
    await this.mailerService.sendMail({
      to: email,
      subject: 'Esports - Account Recovery Request',
      html: `<p>Your account has been deactivated.</p><p>You can recover it by clicking the following link:</p><a href="${recoveryUrl}">${recoveryUrl}</a>`,
    });
  }
}
