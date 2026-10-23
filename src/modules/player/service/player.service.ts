import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CreatePlayerDto } from '../dto/create-player.dto';
import { UpdatePlayerDto } from '../dto/update-player.dto';
import { UpdateDocumentStatusDto } from '../dto/update-document-status.dto';
import { RequestPayoutDto } from '../dto/request-payout.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { deleteImageFromS3 } from '../../utils/s3.util';
import { generatePlayerId } from '../utils/generate-id.util';
import { createActivities } from '../../utils/activity.util';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { formatPlayerResponse } from '../utils/player-response.util';
import { DocumentStatus, Role } from '@prisma/client';
import { PlayerDocumentService } from './player-document.service';
import { PlayerPassService } from './player-pass.service';
import { PlayerWalletService } from './player-wallet.service';

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly documentService: PlayerDocumentService,
    private readonly passService: PlayerPassService,
    private readonly walletService: PlayerWalletService,
  ) {}

  /**
   * Create a new player account with optional profile picture and compliance documents.
   */
  async createPlayer(
    createPlayerDto: CreatePlayerDto,
    profilePictureKey?: string,
    documentKeys?: string[],
  ) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { email: createPlayerDto.email },
    });

    if (existingPlayer) {
      if (existingPlayer.isDeleted) {
        const token = await this.jwtService.signAsync(
          { sub: existingPlayer.playerId, email: existingPlayer.email },
          {
            secret: process.env.JWT_SECRET,
            expiresIn: (process.env.RECOVERY_TOKEN_EXPIRATION || '15m') as any,
          },
        );
        await this.mailService.sendRecoveryLink(
          existingPlayer.email,
          token,
          existingPlayer.firstName,
        );
        throw new ConflictException(
          'This account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('Player with this email already exists');
    }

    const {
      password,
      documents,
      profilePicture,
      dateOfBirth,
      gamertag,
      gamerTag,
      ...rest
    } = createPlayerDto;

    const normalizedGamerTag = gamerTag || gamertag;
    if (normalizedGamerTag) {
      const tagExists = await this.prisma.player.findFirst({
        where: { gamerTag: normalizedGamerTag },
      });
      if (tagExists) {
        throw new ConflictException('This Gamer Tag is already in use');
      }
    }

    let parsedDob: Date | undefined = undefined;
    if (dateOfBirth) {
      const parsed = new Date(dateOfBirth);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException(
          'Invalid dateOfBirth format. Please use ISO format YYYY-MM-DD.',
        );
      }
      parsedDob = parsed;
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    );
    const showPlayerId = await generatePlayerId(this.prisma);
    const initialDocs = documentKeys || [];

    const newPlayer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.player.create({
        data: {
          ...rest,
          password: hashedPassword,
          showPlayerId,
          gamerTag: normalizedGamerTag,
          profilePicture: profilePictureKey || null,
          dateOfBirth: parsedDob || null,
          document: initialDocs,
        },
      });

      if (initialDocs.length > 0) {
        await tx.playerDocument.createMany({
          data: initialDocs.map((url) => ({
            playerId: created.playerId,
            type: 'Government ID',
            url,
            status: DocumentStatus.PENDING,
          })),
        });
      }

      // Initialize compliant wallet ledger account atomically
      await tx.wallet.create({
        data: {
          playerId: created.playerId,
          userId: created.playerId,
          userRole: 'PLAYER',
          cashBalance: 0.0,
          creditBalance: 0.0,
          escrowBalance: 0.0,
          currency: 'NGN',
        },
      });

      return tx.player.findUnique({
        where: { playerId: created.playerId },
        include: { documents: true },
      });
    });

    const title = 'Player Creation';
    const description = `Player ${newPlayer?.firstName} ${newPlayer?.lastName} (${newPlayer?.email}) was successfully created.`;
    await createActivities(this.prisma, title, description, 'PLAYER');

    return formatPlayerResponse(newPlayer);
  }

  /**
   * Update Player Profile / Settings.
   * Performs authorization verification (IDOR protection), sanitization of sensitive fields,
   * uniqueness checks, and delegates document synchronization to PlayerDocumentService.
   */
  async updatePlayer(
    id: string,
    updatePlayerDto: UpdatePlayerDto,
    newProfilePictureKey?: string,
    newDocumentKeys?: string[],
    requestingUser?: { userId: string; role: string },
  ) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { playerId: id },
      include: { documents: true },
    });

    if (!existingPlayer || existingPlayer.isDeleted) {
      throw new NotFoundException('Player not found or account is deactivated');
    }

    // Authorization & Ownership Verification (Strict IDOR protection)
    const isAdmin =
      requestingUser?.role === Role.ADMIN ||
      requestingUser?.role === Role.SUPER_ADMIN ||
      requestingUser?.role === 'admin' ||
      requestingUser?.role === 'super_admin';

    if (requestingUser) {
      const isSelf = requestingUser.userId === id;
      if (!isSelf && !isAdmin) {
        this.logger.warn(
          `Security violation: User ${requestingUser.userId} attempted unauthorized profile update on Player ${id}`,
        );
        throw new ForbiddenException(
          'You do not have permission to modify this player profile.',
        );
      }
    }

    // Email Uniqueness Check
    if (
      updatePlayerDto.email &&
      updatePlayerDto.email.toLowerCase() !== existingPlayer.email.toLowerCase()
    ) {
      const emailTaken = await this.prisma.player.findUnique({
        where: { email: updatePlayerDto.email.toLowerCase() },
      });
      if (emailTaken && emailTaken.playerId !== id) {
        throw new ConflictException('Email is already in use by another account');
      }
    }

    // Username Uniqueness Check
    if (
      updatePlayerDto.username &&
      updatePlayerDto.username !== existingPlayer.username
    ) {
      const usernameTaken = await this.prisma.player.findFirst({
        where: { username: updatePlayerDto.username },
      });
      if (usernameTaken && usernameTaken.playerId !== id) {
        throw new ConflictException('This username is already taken');
      }
    }

    // GamerTag Uniqueness Check
    const targetGamerTag = updatePlayerDto.gamerTag || updatePlayerDto.gamertag;
    if (targetGamerTag && targetGamerTag !== existingPlayer.gamerTag) {
      const gamerTagTaken = await this.prisma.player.findFirst({
        where: { gamerTag: targetGamerTag },
      });
      if (gamerTagTaken && gamerTagTaken.playerId !== id) {
        throw new ConflictException('This Gamer Tag is already taken');
      }
    }

    // Full Name Parsing
    let resolvedFirstName = updatePlayerDto.firstName;
    let resolvedLastName = updatePlayerDto.lastName;
    if (updatePlayerDto.fullName) {
      const parts = updatePlayerDto.fullName.trim().split(/\s+/);
      if (parts.length > 0) {
        resolvedFirstName = parts[0];
        resolvedLastName =
          parts.slice(1).join(' ') || existingPlayer.lastName || parts[0];
      }
    }

    const resolvedPhoneNumber =
      updatePlayerDto.phoneNumber || updatePlayerDto.phone;

    let parsedDob: Date | undefined = undefined;
    if (updatePlayerDto.dateOfBirth) {
      const parsed = new Date(updatePlayerDto.dateOfBirth);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException(
          'Invalid date of birth format. Please use YYYY-MM-DD.',
        );
      }
      parsedDob = parsed;
    }

    // Profile Picture Management
    let updatedProfilePicture = existingPlayer.profilePicture;
    let oldPictureToDelete: string | null = null;

    if (newProfilePictureKey) {
      if (existingPlayer.profilePicture) {
        oldPictureToDelete = existingPlayer.profilePicture;
      }
      updatedProfilePicture = newProfilePictureKey;
    } else if (updatePlayerDto.deleteProfilePicture) {
      if (existingPlayer.profilePicture) {
        oldPictureToDelete = existingPlayer.profilePicture;
      }
      updatedProfilePicture = null;
    }

    // Delegate document reconciliation to PlayerDocumentService
    let docsToDeleteFromS3: string[] = [];

    const updatedPlayerRecord = await this.prisma.$transaction(async (tx) => {
      const { updatedLegacyDocumentList, documentsToDeleteFromS3 } =
        await this.documentService.reconcileDocumentsInTx(
          tx,
          existingPlayer,
          updatePlayerDto,
          newDocumentKeys,
        );

      docsToDeleteFromS3 = documentsToDeleteFromS3;

      return tx.player.update({
        where: { playerId: id },
        data: {
          ...(resolvedFirstName ? { firstName: resolvedFirstName } : {}),
          ...(resolvedLastName ? { lastName: resolvedLastName } : {}),
          ...(updatePlayerDto.email ? { email: updatePlayerDto.email } : {}),
          ...(updatePlayerDto.username
            ? { username: updatePlayerDto.username }
            : {}),
          ...(targetGamerTag ? { gamerTag: targetGamerTag } : {}),
          ...(updatePlayerDto.surname
            ? { surname: updatePlayerDto.surname }
            : {}),
          ...(resolvedPhoneNumber
            ? { phoneNumber: resolvedPhoneNumber }
            : {}),
          ...(parsedDob ? { dateOfBirth: parsedDob } : {}),
          profilePicture: updatedProfilePicture,
          document: updatedLegacyDocumentList,
        },
        include: {
          documents: true,
          registrationHistory: true,
          marketingData: true,
        },
      });
    });

    // Cleanup S3 storage asynchronously after successful DB commit
    if (oldPictureToDelete) {
      void deleteImageFromS3(this.documentService.extractKey(oldPictureToDelete));
    }
    if (docsToDeleteFromS3.length > 0) {
      void Promise.all(
        docsToDeleteFromS3.map((key) => deleteImageFromS3(key)),
      );
    }

    return formatPlayerResponse(updatedPlayerRecord);
  }

  /**
   * Retrieve Player by ID with formatted response.
   */
  async getPlayerById(id: string) {
    if (!id) {
      throw new BadRequestException('Player ID is required');
    }

    const player = await this.prisma.player.findUnique({
      where: { playerId: id },
      include: {
        documents: true,
        registrationHistory: true,
        marketingData: true,
      },
    });

    if (!player || player.isDeleted) {
      throw new NotFoundException('Player not found');
    }

    return formatPlayerResponse(player);
  }

  /**
   * Paginated Player search and listing.
   */
  async getAllPlayer(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['firstName', 'lastName', 'email', 'showPlayerId', 'phoneNumber', 'gamerTag'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          documents: true,
        },
      }),
      this.prisma.player.count({ where }),
    ]);

    const formattedData = await Promise.all(
      data.map((player) => formatPlayerResponse(player)),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: formattedData, meta };
  }

  /**
   * Recover deactivated player account.
   */
  async recoverPlayer(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token);
      const player = await this.prisma.player.findUnique({
        where: { playerId: payload.sub },
      });

      if (!player) {
        throw new NotFoundException('Player not found');
      }

      if (!player.isDeleted) {
        throw new ConflictException('Player account is already active');
      }

      const updated = await this.prisma.player.update({
        where: { playerId: player.playerId },
        data: {
          isDeleted: false,
        },
        include: { documents: true },
      });

      return formatPlayerResponse(updated);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new ConflictException('Recovery link has expired');
      }
      throw new ConflictException('Invalid recovery link');
    }
  }

  /**
   * Soft-delete Player (Admin only).
   */
  async deletePlayer(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { playerId: id },
    });

    if (!player || player.isDeleted) {
      throw new NotFoundException('Player not found or already deleted');
    }

    const updated = await this.prisma.player.update({
      where: { playerId: id },
      data: {
        isDeleted: true,
      },
    });

    return { message: 'Player account successfully deactivated', id: updated.playerId };
  }

  // ---------------------------------------------------------------------------
  // Facade delegations for backwards-compatibility with existing tests and code
  // ---------------------------------------------------------------------------

  async updateDocumentStatus(playerId: string, documentId: string, dto: UpdateDocumentStatusDto) {
    return this.documentService.updateDocumentStatus(playerId, documentId, dto);
  }

  async deleteDocument(playerId: string, documentId: string) {
    return this.documentService.deleteDocument(playerId, documentId);
  }

  async getMyPasses(playerId: string) {
    return this.passService.getMyPasses(playerId);
  }

  async getPassByTournament(playerId: string, tournamentId: string) {
    return this.passService.getPassByTournament(playerId, tournamentId);
  }

  async getWalletBalance(playerId: string) {
    return this.walletService.getWalletBalance(playerId);
  }

  async getLedgerHistory(playerId: string, limit?: number) {
    return this.walletService.getLedgerHistory(playerId, limit);
  }

  async requestPayout(playerId: string, dto: RequestPayoutDto) {
    return this.walletService.requestPayout(playerId, dto);
  }
}
