import { getPreSignedUrl } from '../../utils/s3.util';

export interface FormattedPlayerDocument {
  id: string;
  type: string;
  url: string;
  uploadDate: string;
  status: 'Pending' | 'Verified' | 'Rejected';
  rawStatus: string;
  notes?: string | null;
}

/**
 * Standardized, production-grade Player response serializer.
 * Concurrently resolves S3 presigned URLs with error boundaries,
 * computes virtual attributes (fullName, isVerified),
 * and provides dual compatibility for both the Frontend Contract and Backend Prisma schemas.
 */
export const formatPlayerResponse = async (player: any) => {
  if (!player) return null;

  // 1. Concurrently resolve presigned profile picture if present
  let presignedProfilePicture: string | null = null;
  if (player.profilePicture) {
    try {
      presignedProfilePicture = await getPreSignedUrl(player.profilePicture);
    } catch {
      presignedProfilePicture = player.profilePicture;
    }
  }

  // 2. Resolve and standardize documents
  const formattedDocs: FormattedPlayerDocument[] = [];

  if (
    player.documents &&
    Array.isArray(player.documents) &&
    player.documents.length > 0
  ) {
    await Promise.all(
      player.documents.map(async (doc: any) => {
        let resolvedUrl = doc.url;
        try {
          if (doc.url && !doc.url.startsWith('http')) {
            resolvedUrl = await getPreSignedUrl(doc.url);
          }
        } catch {
          resolvedUrl = doc.url;
        }

        const statusMap: Record<string, 'Pending' | 'Verified' | 'Rejected'> = {
          PENDING: 'Pending',
          VERIFIED: 'Verified',
          REJECTED: 'Rejected',
          Pending: 'Pending',
          Verified: 'Verified',
          Rejected: 'Rejected',
        };

        formattedDocs.push({
          id: doc.id,
          type: doc.type || 'Government ID',
          url: resolvedUrl,
          uploadDate: doc.uploadDate
            ? new Date(doc.uploadDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          status: statusMap[doc.status] || 'Pending',
          rawStatus: doc.status,
          notes: doc.notes ?? null,
        });
      }),
    );
  } else if (
    player.document &&
    Array.isArray(player.document) &&
    player.document.length > 0
  ) {
    // Backwards-compatibility fallback: if raw string keys exist in document[]
    await Promise.all(
      player.document.map(async (docKey: string, idx: number) => {
        let resolvedUrl = docKey;
        try {
          if (docKey && !docKey.startsWith('http')) {
            resolvedUrl = await getPreSignedUrl(docKey);
          }
        } catch {
          resolvedUrl = docKey;
        }

        formattedDocs.push({
          id: `legacy-${idx}-${player.playerId}`,
          type: 'Government ID',
          url: resolvedUrl,
          uploadDate: player.createdAt
            ? new Date(player.createdAt).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          status: 'Pending',
          rawStatus: 'PENDING',
          notes: null,
        });
      }),
    );
  }

  // Legacy string array of presigned URLs
  const legacyDocumentUrls = formattedDocs.map((d) => d.url);

  // Compute isVerified compliance badge flag
  const isVerified = formattedDocs.some((d) => d.status === 'Verified');

  // Format full name
  const fullName = `${player.firstName || ''} ${player.lastName || ''}`.trim();

  // Format date of birth (YYYY-MM-DD)
  const formattedDob = player.dateOfBirth
    ? player.dateOfBirth instanceof Date
      ? player.dateOfBirth.toISOString().split('T')[0]
      : String(player.dateOfBirth).split('T')[0]
    : null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safePlayerData } = player;

  return {
    ...safePlayerData,
    // Frontend Contract Properties
    id: player.playerId,
    fullName,
    gamertag: player.gamerTag || '',
    phone: player.phoneNumber || '',
    profilePicture: presignedProfilePicture,
    dateOfBirth: formattedDob,
    documents: formattedDocs,
    isVerified,

    // Backend Canonical & Legacy Properties
    playerId: player.playerId,
    gamerTag: player.gamerTag,
    phoneNumber: player.phoneNumber,
    firstName: player.firstName,
    lastName: player.lastName,
    document: legacyDocumentUrls,
  };
};
