import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAnnouncementDto } from '../dto/create-announcement.dto';
import { UpdateAnnouncementDto } from '../dto/update-announcement.dto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class AnnouncementService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAnnouncementDto: CreateAnnouncementDto) {
    return this.prisma.announcement.create({
      data: createAnnouncementDto,
    });
  }

  async findAll(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['title', 'content', 'audience'],
    );

    where.isDeleted = false;

    // Optional status filter
    if (query.status) {
      where.status = query.status;
    }

    // Optional audience filter
    if (query.audience) {
      where.audience = query.audience;
    }

    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { announcementId: id },
    });

    if (!announcement || announcement.isDeleted) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    return announcement;
  }

  async update(id: string, updateAnnouncementDto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({
      where: { announcementId: id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    return this.prisma.announcement.update({
      where: { announcementId: id },
      data: updateAnnouncementDto,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { announcementId: id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    return this.prisma.announcement.update({
      where: { announcementId: id },
      data: {
        isDeleted: true,
      },
    });
  }

  // --- Announcement Templates ---

  private readonly DEFAULT_TEMPLATES = [
    {
      key: 'PLAYER_PAYMENT_REQUIRED',
      title: 'Player Payment Required',
      description:
        'Sent to players selected from the registration pool, asking them to pay the entry fee.',
      variables: [
        '{{playerName}}',
        '{{tournamentName}}',
        '{{entryFee}}',
        '{{paymentDeadline}}',
        '{{paymentLink}}',
      ],
      message:
        'Congratulations {{playerName}}! You have been selected to compete in {{tournamentName}}. Please pay the entry fee of {{entryFee}} by {{paymentDeadline}} to confirm your spot. Pay here: {{paymentLink}}',
      defaultMessage:
        'Congratulations {{playerName}}! You have been selected to compete in {{tournamentName}}. Please pay the entry fee of {{entryFee}} by {{paymentDeadline}} to confirm your spot. Pay here: {{paymentLink}}',
    },
    {
      key: 'PLAYER_REGISTRATION_CONFIRMED',
      title: 'Player Registration Confirmed',
      description: 'Sent after a player successfully pays their entry fee.',
      variables: ['{{playerName}}', '{{tournamentName}}'],
      message:
        'Your spot is confirmed, {{playerName}}! Welcome to {{tournamentName}}. Get ready to compete!',
      defaultMessage:
        'Your spot is confirmed, {{playerName}}! Welcome to {{tournamentName}}. Get ready to compete!',
    },
    {
      key: 'PLAYER_PAYMENT_WINDOW_EXPIRED',
      title: 'Player Payment Window Expired',
      description:
        'Sent to a player if they fail to pay within the payment window.',
      variables: ['{{playerName}}', '{{tournamentName}}'],
      message:
        'Hi {{playerName}}, your payment window for {{tournamentName}} has expired. Your spot has been released, but you are still in the registration pool for future selection.',
      defaultMessage:
        'Hi {{playerName}}, your payment window for {{tournamentName}} has expired. Your spot has been released, but you are still in the registration pool for future selection.',
    },
    {
      key: 'STAFF_WELCOME',
      title: 'New Staff Welcome',
      description:
        'Sent to a newly created staff member with their temporary login details.',
      variables: [
        '{{staffName}}',
        '{{staffRole}}',
        '{{tempPassword}}',
        '{{loginLink}}',
      ],
      message:
        'Welcome to the team, {{staffName}}! You have been added as a {{staffRole}}. Your temporary password is: {{tempPassword}}. Please login and change it immediately at: {{loginLink}}',
      defaultMessage:
        'Welcome to the team, {{staffName}}! You have been added as a {{staffRole}}. Your temporary password is: {{tempPassword}}. Please login and change it immediately at: {{loginLink}}',
    },
    {
      key: 'PASSWORD_RESET_SUCCESS',
      title: 'Password Reset Confirmation',
      description: 'Sent after a user successfully resets their password.',
      variables: ['{{userName}}'],
      message:
        'Hi {{userName}}, your password has been successfully changed. If you did not make this change, please contact support immediately.',
      defaultMessage:
        'Hi {{userName}}, your password has been successfully changed. If you did not make this change, please contact support immediately.',
    },
    {
      key: 'TICKET_SMS_RECEIPT',
      title: 'Ticket Purchase SMS',
      description:
        'Sent via SMS to a fan who purchased a ticket via a staff POS terminal.',
      variables: [
        '{{fanName}}',
        '{{tournamentName}}',
        '{{ticketType}}',
        '{{ticketLink}}',
      ],
      message:
        'Hi {{fanName}}, thanks for purchasing a {{ticketType}} for {{tournamentName}}! Your digital ticket is available here: {{ticketLink}}',
      defaultMessage:
        'Hi {{fanName}}, thanks for purchasing a {{ticketType}} for {{tournamentName}}! Your digital ticket is available here: {{ticketLink}}',
    },
  ];

  async seedDefaultTemplates() {
    for (const tpl of this.DEFAULT_TEMPLATES) {
      const existing = await this.prisma.announcementTemplate.findUnique({
        where: { key: tpl.key },
      });
      if (!existing) {
        await this.prisma.announcementTemplate.create({
          data: tpl,
        });
      }
    }
  }

  async getAllTemplates() {
    const count = await this.prisma.announcementTemplate.count();
    if (count === 0) {
      await this.seedDefaultTemplates();
    }
    return this.prisma.announcementTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTemplateById(idOrKey: string) {
    let template = await this.prisma.announcementTemplate.findFirst({
      where: {
        OR: [{ templateId: idOrKey }, { key: idOrKey }],
      },
    });

    if (!template) {
      // If template table might not be seeded yet
      await this.seedDefaultTemplates();
      template = await this.prisma.announcementTemplate.findFirst({
        where: {
          OR: [{ templateId: idOrKey }, { key: idOrKey }],
        },
      });
    }

    if (!template) {
      throw new NotFoundException(`Template '${idOrKey}' not found`);
    }

    return template;
  }

  async updateTemplate(idOrKey: string, updateDto: { message?: string; title?: string; description?: string; variables?: string[] }) {
    const template = await this.getTemplateById(idOrKey);

    return this.prisma.announcementTemplate.update({
      where: { templateId: template.templateId },
      data: updateDto,
    });
  }

  async resetTemplate(idOrKey: string) {
    const template = await this.getTemplateById(idOrKey);

    return this.prisma.announcementTemplate.update({
      where: { templateId: template.templateId },
      data: {
        message: template.defaultMessage,
      },
    });
  }

  async createTemplate(createDto: {
    key: string;
    title: string;
    description: string;
    variables?: string[];
    message: string;
    defaultMessage?: string;
  }) {
    return this.prisma.announcementTemplate.create({
      data: {
        ...createDto,
        defaultMessage: createDto.defaultMessage || createDto.message,
      },
    });
  }
}

