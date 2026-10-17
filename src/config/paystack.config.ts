import { registerAs } from '@nestjs/config';

export default registerAs('paystack', () => ({
  secretKey: process.env.PAYSTACK_SECRET_KEY || '',
  publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
}));
