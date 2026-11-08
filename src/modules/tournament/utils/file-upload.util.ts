import { BadRequestException } from '@nestjs/common';
import { uploadImageToS3, deleteImageFromS3 } from '../../utils/s3.util';

export async function uploadTournamentFiles(files: {
  tournamentLogo?: Express.Multer.File[];
  tournamentBanner?: Express.Multer.File[];
  primaryOrganization?: Express.Multer.File[];
  secondaryOrganization?: Express.Multer.File[];
  fanPassLogo?: Express.Multer.File[];
  fanPassBg?: Express.Multer.File[];
  canvasImage?: Express.Multer.File[];
  bannerUrl?: Express.Multer.File[];
  banner?: Express.Multer.File[];
  fanPassArtUrl?: Express.Multer.File[];
  playerOrgUrl?: Express.Multer.File[];
  organizerLogo?: Express.Multer.File[];
  prOrgUrl?: Express.Multer.File[];
  secondaryOrganizerLogo?: Express.Multer.File[];
  tournamentLogoUrl?: Express.Multer.File[];
  logo?: Express.Multer.File[];
  rules?: Express.Multer.File[];
  termsAndConditions?: Express.Multer.File[];
  tsAndTc?: Express.Multer.File[];
}): Promise<{
  tournamentLogo: string | null;
  tournamentBanner: string | null;
  primaryOrganization: string | null;
  secondaryOrganization: string | null;
  fanPassLogo: string | null;
  fanPassBg: string | null;
  canvasImage: string | null;
  fanPassArtUrl: string | null;
  playerOrgUrl: string | null;
  prOrgUrl: string | null;
  tournamentLogoUrl: string | null;
  rules: string[];
  termsAndConditions: string[];
  tsAndTc: string[];
}> {
  let s3TournamentLogo: string | null = null;
  let s3TournamentBanner: string | null = null;
  let s3PrimaryOrganization: string | null = null;
  let s3SecondaryOrganization: string | null = null;
  let s3FanPassLogo: string | null = null;
  let s3FanPassBg: string | null = null;
  const s3RulesFilenames: string[] = [];
  const s3TsAndTcFilenames: string[] = [];

  try {
    const bannerFile =
      files?.tournamentBanner?.[0] ||
      files?.canvasImage?.[0] ||
      files?.bannerUrl?.[0] ||
      files?.banner?.[0];
    if (bannerFile) {
      s3TournamentBanner = await uploadImageToS3(bannerFile);
    }

    const logoFile =
      files?.tournamentLogo?.[0] ||
      files?.tournamentLogoUrl?.[0] ||
      files?.logo?.[0];
    if (logoFile) {
      s3TournamentLogo = await uploadImageToS3(logoFile);
    }

    const primaryOrgFile =
      files?.primaryOrganization?.[0] ||
      files?.playerOrgUrl?.[0] ||
      files?.organizerLogo?.[0];
    if (primaryOrgFile) {
      s3PrimaryOrganization = await uploadImageToS3(primaryOrgFile);
    }

    const secondaryOrgFile =
      files?.secondaryOrganization?.[0] ||
      files?.prOrgUrl?.[0] ||
      files?.secondaryOrganizerLogo?.[0];
    if (secondaryOrgFile) {
      s3SecondaryOrganization = await uploadImageToS3(secondaryOrgFile);
    }

    const fanLogoFile = files?.fanPassLogo?.[0];
    if (fanLogoFile) {
      s3FanPassLogo = await uploadImageToS3(fanLogoFile);
    }

    const fanBgFile = files?.fanPassBg?.[0] || files?.fanPassArtUrl?.[0];
    if (fanBgFile) {
      s3FanPassBg = await uploadImageToS3(fanBgFile);
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
      tournamentLogo: s3TournamentLogo,
      tournamentBanner: s3TournamentBanner,
      primaryOrganization: s3PrimaryOrganization,
      secondaryOrganization: s3SecondaryOrganization,
      fanPassLogo: s3FanPassLogo,
      fanPassBg: s3FanPassBg,
      canvasImage: s3TournamentBanner,
      fanPassArtUrl: s3FanPassBg,
      playerOrgUrl: s3PrimaryOrganization,
      prOrgUrl: s3SecondaryOrganization,
      tournamentLogoUrl: s3TournamentLogo,
      rules: s3RulesFilenames,
      termsAndConditions: s3TsAndTcFilenames,
      tsAndTc: s3TsAndTcFilenames,
    });
    throw new BadRequestException(
      'File upload failed. Please verify your AWS S3 bucket configuration.',
    );
  }

  return {
    tournamentLogo: s3TournamentLogo,
    tournamentBanner: s3TournamentBanner,
    primaryOrganization: s3PrimaryOrganization,
    secondaryOrganization: s3SecondaryOrganization,
    fanPassLogo: s3FanPassLogo,
    fanPassBg: s3FanPassBg,
    canvasImage: s3TournamentBanner,
    fanPassArtUrl: s3FanPassBg,
    playerOrgUrl: s3PrimaryOrganization,
    prOrgUrl: s3SecondaryOrganization,
    tournamentLogoUrl: s3TournamentLogo,
    rules: s3RulesFilenames,
    termsAndConditions: s3TsAndTcFilenames,
    tsAndTc: s3TsAndTcFilenames,
  };
}

export async function rollbackTournamentFiles(files: {
  tournamentLogo?: string | null;
  tournamentBanner?: string | null;
  primaryOrganization?: string | null;
  secondaryOrganization?: string | null;
  fanPassLogo?: string | null;
  fanPassBg?: string | null;
  canvasImage?: string | null;
  fanPassArtUrl?: string | null;
  playerOrgUrl?: string | null;
  prOrgUrl?: string | null;
  tournamentLogoUrl?: string | null;
  rules?: string[];
  termsAndConditions?: string[];
  tsAndTc?: string[];
}) {
  const bannerImg = files.tournamentBanner || files.canvasImage;
  if (bannerImg) {
    await deleteImageFromS3(bannerImg);
  }
  const logoImg = files.tournamentLogo || files.tournamentLogoUrl;
  if (logoImg) {
    await deleteImageFromS3(logoImg);
  }
  const primaryOrgImg = files.primaryOrganization || files.playerOrgUrl;
  if (primaryOrgImg) {
    await deleteImageFromS3(primaryOrgImg);
  }
  const secondaryOrgImg = files.secondaryOrganization || files.prOrgUrl;
  if (secondaryOrgImg) {
    await deleteImageFromS3(secondaryOrgImg);
  }
  if (files.fanPassLogo) {
    await deleteImageFromS3(files.fanPassLogo);
  }
  const fanBgImg = files.fanPassBg || files.fanPassArtUrl;
  if (fanBgImg) {
    await deleteImageFromS3(fanBgImg);
  }
  if (files.tournamentLogoUrl && files.tournamentLogoUrl !== files.tournamentLogo) {
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
