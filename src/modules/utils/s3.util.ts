import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

  // Return only the unique file name to be stored in the DB
  return uniqueFileName;
};

export const uploadMultipleFilesToS3 = async (
  files: Express.Multer.File[],
): Promise<string[]> => {
  if (!files || files.length === 0) return [];
  return Promise.all(files.map((file) => uploadImageToS3(file)));
};

/**
 * Generates a pre-signed URL for downloading an object from S3.
 * @param fileName The unique file name (S3 Key) stored in your database
 * @param expiresIn Time in seconds until the URL expires (default 3600s / 1 hour)
 */
export const getPreSignedUrl = async (
  fileName: string,
  expiresIn: number = parseInt(process.env.AWS_PRESIGNED_URL_EXPIRES_IN || '3600', 10),
): Promise<string> => {
  if (!fileName) return '';

  // For backwards compatibility: if a full S3 URL is passed, extract just the filename (the key)
  let key = fileName;
  if (fileName.startsWith('http')) {
    const url = new URL(fileName);
    // The pathname usually starts with a slash, e.g., /654b825f-a2ae-4e27-9832-79b1e607ddc1.jpeg
    key = url.pathname.substring(1); 
  }

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET_NAME || '';
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME is not defined in environment variables');
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Deletes an object from S3.
 * @param fileName The unique file name (S3 Key) stored in your database
 */
export const deleteImageFromS3 = async (fileName: string): Promise<void> => {
  if (!fileName) return;

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  const bucketName = process.env.AWS_S3_BUCKET_NAME || '';
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME is not defined in environment variables');
  }

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fileName,
  });

  try {
    await s3Client.send(command);
  } catch (error) {
    console.error('Failed to delete image from S3:', error);
  }
};
