import { BadRequestException } from '@nestjs/common';
import { uploadImageToS3, deleteImageFromS3 } from '../../utils/s3.util';

export async function uploadTournamentFiles(files: {
  canvasImage?: Express.Multer.File[];
  fanPassArtUrl?: Express.Multer.File[];
  playerOrgUrl?: Express.Multer.File[];
  organizerLogo?: Express.Multer.File[];
  prOrgUrl?: Express.Multer.File[];
  secondaryOrganizerLogo?: Express.Multer.File[];
  tournamentLogoUrl?: Express.Multer.File[];
  tournamentLogo?: Express.Multer.File[];
  logo?: Express.Multer.File[];
  rules?: Express.Multer.File[];
  termsAndConditions?: Express.Multer.File[];
  tsAndTc?: Express.Multer.File[];
}): Promise<{
  canvasImage: string | null;
  fanPassArtUrl: string | null;
  playerOrgUrl: string | null;
  prOrgUrl: string | null;
  tournamentLogoUrl: string | null;
  rules: string[];
  termsAndConditions: string[];
  tsAndTc: string[];
}> {
  let s3CanvasImage: string | null = null;
  let s3PlayerOrgUrl: string | null = null;
  let s3PrOrgUrl: string | null = null;
  let s3TournamentLogoUrl: string | null = null;
  const s3RulesFilenames: string[] = [];
  const s3TsAndTcFilenames: string[] = [];

  try {
    const canvasFile = files?.canvasImage?.[0] || files?.fanPassArtUrl?.[0];
    if (canvasFile) {
      s3CanvasImage = await uploadImageToS3(canvasFile);
    }

    const playerOrgFile = files?.playerOrgUrl?.[0] || files?.organizerLogo?.[0];
    if (playerOrgFile) {
      s3PlayerOrgUrl = await uploadImageToS3(playerOrgFile);
    }

    const prOrgFile =
      files?.prOrgUrl?.[0] || files?.secondaryOrganizerLogo?.[0];
    if (prOrgFile) {
      s3PrOrgUrl = await uploadImageToS3(prOrgFile);
    }

    const logoFile =
      files?.tournamentLogoUrl?.[0] ||
      files?.tournamentLogo?.[0] ||
      files?.logo?.[0];
    if (logoFile) {
      s3TournamentLogoUrl = await uploadImageToS3(logoFile);
    }

    if (files?.rules?.length) {
      for (const file of files.rules) {
        const s3Filename = await uploadImageToS3(file);
        s3RulesFilenames.push(s3Filename);
      }
    }

    const termsFiles = files?.termsAndConditions || files?.tsAndTc;
    if (termsFiles?.length) {
      for (const file of termsFiles) {
        const s3Filename = await uploadImageToS3(file);
        s3TsAndTcFilenames.push(s3Filename);
      }
    }
  } catch {
    await rollbackTournamentFiles({
      canvasImage: s3CanvasImage,
      fanPassArtUrl: s3CanvasImage,
      playerOrgUrl: s3PlayerOrgUrl,
      prOrgUrl: s3PrOrgUrl,
      tournamentLogoUrl: s3TournamentLogoUrl,
      rules: s3RulesFilenames,
      termsAndConditions: s3TsAndTcFilenames,
      tsAndTc: s3TsAndTcFilenames,
    });
    throw new BadRequestException(
      'File upload failed. Please verify your AWS S3 bucket configuration.',
    );
  }

  return {
    canvasImage: s3CanvasImage,
    fanPassArtUrl: s3CanvasImage,
    playerOrgUrl: s3PlayerOrgUrl,
    prOrgUrl: s3PrOrgUrl,
    tournamentLogoUrl: s3TournamentLogoUrl,
    rules: s3RulesFilenames,
    termsAndConditions: s3TsAndTcFilenames,
    tsAndTc: s3TsAndTcFilenames,
  };
}

export async function rollbackTournamentFiles(files: {
  canvasImage?: string | null;
  fanPassArtUrl?: string | null;
  playerOrgUrl?: string | null;
  prOrgUrl?: string | null;
  tournamentLogoUrl?: string | null;
  rules?: string[];
  termsAndConditions?: string[];
  tsAndTc?: string[];
}) {
  const canvasImg = files.canvasImage || files.fanPassArtUrl;
  if (canvasImg) {
    await deleteImageFromS3(canvasImg);
  }
  if (files.playerOrgUrl) {
    await deleteImageFromS3(files.playerOrgUrl);
  }
  if (files.prOrgUrl) {
    await deleteImageFromS3(files.prOrgUrl);
  }
  if (files.tournamentLogoUrl) {
    await deleteImageFromS3(files.tournamentLogoUrl);
  }
  if (files.rules?.length) {
    for (const filename of files.rules) {
      await deleteImageFromS3(filename);
    }
  }
  const terms = files.termsAndConditions || files.tsAndTc;
  if (terms?.length) {
    for (const filename of terms) {
      await deleteImageFromS3(filename);
    }
  }
}

/**
 * Normalizes input (array, JSON string, comma-separated string, or single string) into a clean string array.
 * Filters out Swagger dummy placeholders (e.g. "string") and empty whitespace.
 */
export function normalizeStringArray(val: any): string[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) {
    return val
      .map((x) => (typeof x === 'string' ? x.trim() : String(x)))
      .filter((x) => x.length > 0 && x !== 'string');
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === 'string') return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => (typeof x === 'string' ? x.trim() : String(x)))
          .filter((x) => x.length > 0 && x !== 'string');
      }
      if (
        typeof parsed === 'string' &&
        parsed.trim() &&
        parsed.trim() !== 'string'
      ) {
        return [parsed.trim()];
      }
    } catch {
      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s !== 'string');
      }
      return [trimmed];
    }
  }
  return [];
}
