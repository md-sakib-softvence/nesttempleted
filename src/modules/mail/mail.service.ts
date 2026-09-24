import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { join } from 'path';
import { existsSync } from 'fs';

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

  async sendPasswordResetLink(email: string, token: string) {
    console.log(`[MAILER] Preparing to send password reset link to: ${email}`);
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    await this.mailerService.sendMail({
      to: email,
      subject: 'Esports - Password Reset Request',
      html: `<p>You requested to reset your password.</p><p>You can reset it by clicking the following link:</p><a href="${resetUrl}">${resetUrl}</a><p>This link will expire in 15 minutes.</p>`,
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

  async sendWelcomeEmail(email: string, name: string, password?: string) {
    console.log(`[MAILER] Preparing to send welcome email to: ${email}`);

    const headerImagePath = existsSync(
      join(__dirname, 'templates/images/header.png'),
    )
      ? join(__dirname, 'templates/images/header.png')
      : join(process.cwd(), 'src/modules/mail/templates/images/header.png');

    const footerImagePath = existsSync(
      join(__dirname, 'templates/images/footer.png'),
    )
      ? join(__dirname, 'templates/images/footer.png')
      : join(process.cwd(), 'src/modules/mail/templates/images/footer.png');

    const attachments: any[] = [];
    if (existsSync(headerImagePath)) {
      attachments.push({
        filename: 'header.png',
        path: headerImagePath,
        cid: 'headerImage',
      });
    }
    if (existsSync(footerImagePath)) {
      attachments.push({
        filename: 'footer.png',
        path: footerImagePath,
        cid: 'footerImage',
      });
    }

    const firstName = name ? name.trim() : 'Fan';

    await this.mailerService.sendMail({
      to: email,
      subject: 'Welcome to LeFC Series 1! 🎮⚽️',
      template: './welcome',
      context: {
        firstName,
        name: firstName,
        password,
      },
      attachments,
    });
  }
}
