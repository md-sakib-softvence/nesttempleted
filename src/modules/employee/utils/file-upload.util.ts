import { BadRequestException } from '@nestjs/common';
import { uploadImageToS3, deleteImageFromS3 } from '../../utils/s3.util';

export async function uploadEmployeeFiles(files: {
  profileImage?: Express.Multer.File[];
  document?: Express.Multer.File[];
}): Promise<{ profileImage: string | null; document: string[] }> {
  let s3ProfileImageFilename: string | null = null;
  const s3DocumentFilenames: string[] = [];

  if (files?.profileImage?.[0]) {
    try {
      s3ProfileImageFilename = await uploadImageToS3(files.profileImage[0]);
    } catch (error) {
      throw new BadRequestException(
        'Profile image upload failed. Please verify your AWS S3 bucket configuration.',
      );
    }
  }

  if (files?.document?.length) {
    try {
      for (const file of files.document) {
        const s3Filename = await uploadImageToS3(file);
        s3DocumentFilenames.push(s3Filename);
      }
    } catch (error) {
      await rollbackEmployeeFiles(s3ProfileImageFilename, s3DocumentFilenames);
      throw new BadRequestException(
        'Document upload failed. Please verify your AWS S3 bucket configuration.',
      );
    }
  }

  return {
    profileImage: s3ProfileImageFilename,
    document: s3DocumentFilenames,
  };
}

export async function rollbackEmployeeFiles(
  profileImage: string | null | undefined,
  document: string[] | undefined,
) {
  if (profileImage) {
    await deleteImageFromS3(profileImage);
  }
  if (document && document.length > 0) {
    for (const s3Filename of document) {
      await deleteImageFromS3(s3Filename);
    }
  }
}
