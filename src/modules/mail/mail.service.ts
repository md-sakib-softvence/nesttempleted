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
    const frontendBase = (
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_DOMAIN ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    const resetUrl = `${frontendBase}/reset-password?token=${token}`;
    await this.mailerService.sendMail({
      to: email,
      subject: 'Esports - Password Reset Request',
      html: `<p>You requested to reset your password.</p><p>You can reset it by clicking the following link:</p><a href="${resetUrl}">${resetUrl}</a><p>This link will expire in 15 minutes.</p>`,
    });
  }

  private getEmailAttachments() {
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

    return attachments;
  }

  async sendRecoveryLink(email: string, token: string, name?: string) {
    console.log(`[MAILER] Preparing to send recovery link to: ${email}`);
    const frontendBase = (
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_DOMAIN ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    const recoveryUrl = `${frontendBase}/recover?token=${token}`;
    const attachments = this.getEmailAttachments();
    const firstName = name ? name.trim() : 'Gamer';

    await this.mailerService.sendMail({
      to: email,
      subject: 'Recover Your LeFC Account 🎮⚽️',
      template: './account-recovery',
      context: {
        firstName,
        name: firstName,
        recoveryUrl,
      },
      attachments,
    });
  }

  async sendWelcomeEmail(email: string, name: string, password?: string) {
    console.log(`[MAILER] Preparing to send welcome email to: ${email}`);
    const attachments = this.getEmailAttachments();
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
