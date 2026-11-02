import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TournamentGuidelineSection,
  TournamentGuidelineType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { uploadImageToS3, deleteImageFromS3, getPreSignedUrl } from '../../utils/s3.util';
import {
  CreateTournamentGuidelineDto,
  UpdateTournamentGuidelineDto,
} from '../dto/guideline/guideline.dto';

const MAX_GUIDELINE_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_GUIDELINE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'image/png',
  'image/jpeg',
]);

@Injectable()
export class TournamentGuidelineService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTournament(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      select: { tournamentId: true, isDeleted: true },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }
  }

  private validatePayload(
    type: TournamentGuidelineType,
    dto: CreateTournamentGuidelineDto | UpdateTournamentGuidelineDto,
    file?: Express.Multer.File,
    existing?: {
      content: string | null;
      externalUrl: string | null;
      storageKey: string | null;
      fileName?: string | null;
      mimeType?: string | null;
    },
  ) {
    if (
      type === TournamentGuidelineType.TEXT &&
      !dto.content?.trim() &&
      !existing?.content?.trim()
    ) {
      throw new BadRequestException('TEXT guidelines require content');
    }
    if (type === TournamentGuidelineType.FILE && !file && !existing?.storageKey) {
      throw new BadRequestException('FILE guidelines require an uploaded file');
    }
    if (file) {
      if (!ALLOWED_GUIDELINE_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          'Unsupported guideline file type. Use PDF, DOC, DOCX, TXT, RTF, PNG, or JPG.',
        );
      }
      if (file.size > MAX_GUIDELINE_FILE_SIZE) {
        throw new BadRequestException('Guideline files must be 10 MB or smaller');
      }
    }
    if (
      type === TournamentGuidelineType.LINK &&
      !dto.externalUrl &&
      !existing?.externalUrl
    ) {
      throw new BadRequestException('LINK guidelines require externalUrl');
    }
  }

  private async present(guideline: any) {
    return {
      ...guideline,
      downloadUrl: guideline.storageKey
        ? await getPreSignedUrl(guideline.storageKey)
        : null,
    };
  }

  async list(tournamentId: string, includeUnpublished = false) {
    await this.assertTournament(tournamentId);
    const rows = await this.prisma.tournamentGuideline.findMany({
      where: {
        tournamentId,
        ...(includeUnpublished ? {} : { isPublished: true }),
      },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return Promise.all(rows.map((row) => this.present(row)));
  }

  async create(
    tournamentId: string,
    dto: CreateTournamentGuidelineDto,
    file?: Express.Multer.File,
  ) {
    await this.assertTournament(tournamentId);
    this.validatePayload(dto.type, dto, file);

    let storageKey: string | undefined;
    if (dto.type === TournamentGuidelineType.FILE && file) {
      storageKey = await uploadImageToS3(file);
    }

    try {
      const created = await this.prisma.tournamentGuideline.create({
        data: {
          tournamentId,
          key: dto.key,
          section: dto.section,
          type: dto.type,
          audience: dto.audience,
          title: dto.title,
          content: dto.type === TournamentGuidelineType.TEXT ? dto.content : null,
          storageKey: dto.type === TournamentGuidelineType.FILE ? storageKey : null,
          externalUrl: dto.type === TournamentGuidelineType.LINK ? dto.externalUrl : null,
          fileName: file?.originalname,
          mimeType: file?.mimetype,
          sortOrder: dto.sortOrder,
          version: dto.version,
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
          requiresAcceptance: dto.requiresAcceptance,
          isPublished: dto.isPublished,
        },
      });
      return this.present(created);
    } catch (error) {
      if (storageKey) await deleteImageFromS3(storageKey);
      throw error;
    }
  }

  async update(
    tournamentId: string,
    guidelineId: string,
    dto: UpdateTournamentGuidelineDto,
    file?: Express.Multer.File,
  ) {
    await this.assertTournament(tournamentId);
    const existing = await this.prisma.tournamentGuideline.findFirst({
      where: { id: guidelineId, tournamentId },
    });
    if (!existing) throw new NotFoundException('Tournament guideline not found');

    const nextType = dto.type || existing.type;
    this.validatePayload(nextType, dto as CreateTournamentGuidelineDto, file, existing);
    const newStorageKey =
      nextType === TournamentGuidelineType.FILE && file
        ? await uploadImageToS3(file)
        : undefined;

    const data: Prisma.TournamentGuidelineUpdateInput = {
      key: dto.key,
      section: dto.section,
      type: dto.type,
      audience: dto.audience,
      title: dto.title,
      content:
        nextType === TournamentGuidelineType.TEXT
          ? dto.content ?? existing.content
          : null,
      externalUrl:
        nextType === TournamentGuidelineType.LINK
          ? dto.externalUrl ?? existing.externalUrl
          : null,
      storageKey:
        nextType === TournamentGuidelineType.FILE
          ? newStorageKey || existing.storageKey
          : null,
      fileName:
        nextType === TournamentGuidelineType.FILE
          ? file?.originalname ?? existing.fileName
          : null,
      mimeType:
        nextType === TournamentGuidelineType.FILE
          ? file?.mimetype ?? existing.mimeType
          : null,
      sortOrder: dto.sortOrder,
      version: dto.version,
      effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
      requiresAcceptance: dto.requiresAcceptance,
      isPublished: dto.isPublished,
    };

    try {
      const updated = await this.prisma.tournamentGuideline.update({
        where: { id: guidelineId },
        data,
      });
      if (newStorageKey && existing.storageKey && existing.storageKey !== newStorageKey) {
        await deleteImageFromS3(existing.storageKey);
      }
      return this.present(updated);
    } catch (error) {
      if (newStorageKey) await deleteImageFromS3(newStorageKey);
      throw error;
    }
  }

  async remove(tournamentId: string, guidelineId: string) {
    await this.assertTournament(tournamentId);
    const existing = await this.prisma.tournamentGuideline.findFirst({
      where: { id: guidelineId, tournamentId },
    });
    if (!existing) throw new NotFoundException('Tournament guideline not found');
    await this.prisma.tournamentGuideline.delete({ where: { id: guidelineId } });
    if (existing.storageKey) await deleteImageFromS3(existing.storageKey);
    return { id: guidelineId, deleted: true };
  }

  async getBySection(tournamentId: string, section: TournamentGuidelineSection) {
    const rows = await this.list(tournamentId);
    return rows.filter((row) => row.section === section);
  }
}
