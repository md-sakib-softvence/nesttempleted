import { BadRequestException } from '@nestjs/common';
import { uploadImageToS3, deleteImageFromS3 } from '../../utils/s3.util';

export async function uploadTournamentFiles(files: {
  canvasImage?: Express.Multer.File[];
  playerOrgUrl?: Express.Multer.File[];
  prOrgUrl?: Express.Multer.File[];
  tournamentLogoUrl?: Express.Multer.File[];
  tournamentLogo?: Express.Multer.File[];
  rules?: Express.Multer.File[];
  tsAndTc?: Express.Multer.File[];
}): Promise<{
  canvasImage: string | null;
  playerOrgUrl: string | null;
  prOrgUrl: string | null;
  tournamentLogoUrl: string | null;
  rules: string[];
  tsAndTc: string[];
}> {
  let s3CanvasImage: string | null = null;
  let s3PlayerOrgUrl: string | null = null;
  let s3PrOrgUrl: string | null = null;
  let s3TournamentLogoUrl: string | null = null;
  const s3RulesFilenames: string[] = [];
  const s3TsAndTcFilenames: string[] = [];

  try {
    if (files?.canvasImage?.[0]) {
      s3CanvasImage = await uploadImageToS3(files.canvasImage[0]);
    }

    if (files?.playerOrgUrl?.[0]) {
      s3PlayerOrgUrl = await uploadImageToS3(files.playerOrgUrl[0]);
    }

    if (files?.prOrgUrl?.[0]) {
      s3PrOrgUrl = await uploadImageToS3(files.prOrgUrl[0]);
    }

    const logoFile =
      files?.tournamentLogoUrl?.[0] || files?.tournamentLogo?.[0];
    if (logoFile) {
      s3TournamentLogoUrl = await uploadImageToS3(logoFile);
    }

    if (files?.rules?.length) {
      for (const file of files.rules) {
        const s3Filename = await uploadImageToS3(file);
        s3RulesFilenames.push(s3Filename);
      }
    }

    if (files?.tsAndTc?.length) {
      for (const file of files.tsAndTc) {
        const s3Filename = await uploadImageToS3(file);
        s3TsAndTcFilenames.push(s3Filename);
      }
    }
  } catch {
    await rollbackTournamentFiles({
      canvasImage: s3CanvasImage,
      playerOrgUrl: s3PlayerOrgUrl,
      prOrgUrl: s3PrOrgUrl,
      tournamentLogoUrl: s3TournamentLogoUrl,
      rules: s3RulesFilenames,
      tsAndTc: s3TsAndTcFilenames,
    });
    throw new BadRequestException(
      'File upload failed. Please verify your AWS S3 bucket configuration.',
    );
  }

  return {
    canvasImage: s3CanvasImage,
    playerOrgUrl: s3PlayerOrgUrl,
    prOrgUrl: s3PrOrgUrl,
    tournamentLogoUrl: s3TournamentLogoUrl,
    rules: s3RulesFilenames,
    tsAndTc: s3TsAndTcFilenames,
  };
}

export async function rollbackTournamentFiles(files: {
  canvasImage?: string | null;
  playerOrgUrl?: string | null;
  prOrgUrl?: string | null;
  tournamentLogoUrl?: string | null;
  rules?: string[];
  tsAndTc?: string[];
}) {
  if (files.canvasImage) {
    await deleteImageFromS3(files.canvasImage);
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
  if (files.tsAndTc?.length) {
    for (const filename of files.tsAndTc) {
      await deleteImageFromS3(filename);
    }
  }
}
