import { registerAs } from '@nestjs/config';

export default registerAs('flutterwave', () => ({
  secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
  publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
  encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
  secretHash: process.env.FLUTTERWAVE_SECRET_HASH || '',
  baseUrl: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
}));
