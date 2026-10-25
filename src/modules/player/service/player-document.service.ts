import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateDocumentStatusDto } from '../dto/update-document-status.dto';
import { UpdatePlayerDto } from '../dto/update-player.dto';
import { deleteImageFromS3 } from '../../utils/s3.util';
import { DocumentStatus } from '@prisma/client';

@Injectable()
export class PlayerDocumentService {
  private readonly logger = new Logger(PlayerDocumentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to safely extract S3 object key from a full URL or raw key.
   */
  extractKey(urlOrKey: string): string {
    if (!urlOrKey) return '';
    if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
      try {
        const url = new URL(urlOrKey);
        return url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
      } catch {
        return urlOrKey;
      }
    }
    return urlOrKey;
  }

  /**
   * Admin verification endpoint for Player Government ID / Documents.
   */
  async updateDocumentStatus(
    playerId: string,
    documentId: string,
    dto: UpdateDocumentStatusDto,
  ) {
    const doc = await this.prisma.playerDocument.findFirst({
      where: { id: documentId, playerId },
    });

    if (!doc) {
      throw new NotFoundException(
        `Document ${documentId} not found for Player ${playerId}`,
      );
    }

    const updated = await this.prisma.playerDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        notes: dto.notes ?? null,
      },
    });

    this.logger.log(
      `Player document ${documentId} status updated to ${dto.status} for player ${playerId}`,
    );

    return updated;
  }

  /**
   * Delete a specific document directly and clean up S3 storage.
   */
  async deleteDocument(playerId: string, documentId: string) {
    const doc = await this.prisma.playerDocument.findFirst({
      where: { id: documentId, playerId },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    // Attempt S3 deletion with failure boundary
    try {
      await deleteImageFromS3(this.extractKey(doc.url));
    } catch (err) {
      this.logger.warn(`Failed to delete S3 file for document ${documentId}: ${err?.message}`);
    }

    await this.prisma.playerDocument.delete({
      where: { id: documentId },
    });

    const player = await this.prisma.player.findUnique({
      where: { playerId },
      select: { document: true },
    });

    if (player && player.document.includes(doc.url)) {
      await this.prisma.player.update({
        where: { playerId },
        data: {
          document: player.document.filter((d) => d !== doc.url),
        },
      });
    }

    return { message: 'Document deleted successfully' };
  }

  /**
   * Reconcile documents during player profile update.
   * Resolves deleted documents, creates new document rows in the transaction,
   * and returns S3 keys that need async cleanup.
   */
  async reconcileDocumentsInTx(
    tx: any,
    existingPlayer: any,
    updatePlayerDto: UpdatePlayerDto,
    newDocumentKeys?: string[],
  ): Promise<{
    updatedLegacyDocumentList: string[];
    documentsToDeleteFromS3: string[];
  }> {
    const documentsToDeleteFromS3: string[] = [];
    const documentIdsToDeleteFromDb: string[] = [];

    if (
      updatePlayerDto.deletedDocuments &&
      updatePlayerDto.deletedDocuments.length > 0
    ) {
      for (const item of updatePlayerDto.deletedDocuments) {
        const itemKey = this.extractKey(item);
        const matched = (existingPlayer.documents || []).find(
          (d: any) => d.id === item || this.extractKey(d.url) === itemKey,
        );
        if (matched) {
          documentIdsToDeleteFromDb.push(matched.id);
          documentsToDeleteFromS3.push(this.extractKey(matched.url));
        } else {
          documentsToDeleteFromS3.push(itemKey);
        }
      }
    }

    // 1. Delete requested documents from DB
    if (documentIdsToDeleteFromDb.length > 0) {
      await tx.playerDocument.deleteMany({
        where: {
          id: { in: documentIdsToDeleteFromDb },
          playerId: existingPlayer.playerId,
        },
      });
    }

    // 2. Create newly uploaded document records in DB
    if (newDocumentKeys && newDocumentKeys.length > 0) {
      const docType = updatePlayerDto.documentType || 'Government ID';
      await tx.playerDocument.createMany({
        data: newDocumentKeys.map((key) => ({
          playerId: existingPlayer.playerId,
          type: docType,
          url: key,
          status: DocumentStatus.PENDING,
        })),
      });
    }

    // 3. Compute legacy document list
    let updatedLegacyDocumentList = existingPlayer.document || [];
    if (documentsToDeleteFromS3.length > 0) {
      updatedLegacyDocumentList = updatedLegacyDocumentList.filter((doc: string) => {
        const docKey = this.extractKey(doc);
        return !documentsToDeleteFromS3.includes(docKey);
      });
    }
    if (newDocumentKeys && newDocumentKeys.length > 0) {
      updatedLegacyDocumentList = [
        ...updatedLegacyDocumentList,
        ...newDocumentKeys,
      ];
    }

    return {
      updatedLegacyDocumentList,
      documentsToDeleteFromS3,
    };
  }
}
