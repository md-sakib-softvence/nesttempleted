import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export const uploadImageToS3 = async (
  file: Express.Multer.File,
): Promise<string> => {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET_NAME || '';
  if (!bucketName) {
    throw new Error(
      'AWS_S3_BUCKET_NAME is not defined in environment variables',
    );
  }

  // Generate a unique file name
  const fileExtension = path.extname(file.originalname);
  const uniqueFileName = `${uuidv4()}${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: uniqueFileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    // Optional: make it public depending on your S3 settings
    // ACL: 'public-read',
  });

  await s3Client.send(command);

  // Return the public URL
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${uniqueFileName}`;
};

export const uploadMultipleFilesToS3 = async (
  files: Express.Multer.File[],
): Promise<string[]> => {
  if (!files || files.length === 0) return [];
  return Promise.all(files.map((file) => uploadImageToS3(file)));
};
