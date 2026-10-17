import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { CreatePaymentDto } from '../dto/create-payment.dto';

export interface PaystackInitResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paidAt?: string;
  channel?: string;
  gatewayResponse?: string;
  customer?: Record<string, any>;
  metadata?: Record<string, any>;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('paystack.secretKey') ||
      process.env.PAYSTACK_SECRET_KEY ||
      '';
    this.baseUrl =
      this.configService.get<string>('paystack.baseUrl') ||
      process.env.PAYSTACK_BASE_URL ||
      'https://api.paystack.co';
  }

  private ensureSecretKeyConfigured(): void {
    if (!this.secretKey) {
      this.logger.error(
        'PAYSTACK_SECRET_KEY is not defined in environment variables',
      );
      throw new InternalServerErrorException(
        'Paystack payment gateway is not properly configured on this server.',
      );
    }
  }

  /**
   * Initialize a new Paystack payment transaction
   */
  async createPayment(dto: CreatePaymentDto): Promise<PaystackInitResponse> {
    this.ensureSecretKeyConfigured();

    const reference =
      dto.reference || `PAY-${Date.now()}-${uuidv4().slice(0, 8)}`;
    // Paystack amounts are in subunit (kobo for NGN, cents for USD/GHS/ZAR)
    const amountInSubunits = Math.round(dto.amount * 100);

    const payload: Record<string, any> = {
      email: dto.email,
      amount: amountInSubunits,
      currency: dto.currency || 'NGN',
      reference,
    };

    if (dto.callbackUrl) {
      payload.callback_url = dto.callbackUrl;
    }

    if (dto.channels && dto.channels.length > 0) {
      payload.channels = dto.channels;
    }

    if (dto.metadata) {
      payload.metadata = dto.metadata;
    }

    try {
      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.status) {
        const errorMsg =
          result.message || 'Payment initialization failed at Paystack';
        this.logger.error(`Paystack initialize error: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }

      return {
        authorizationUrl: result.data.authorization_url,
        accessCode: result.data.access_code,
        reference: result.data.reference,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Unexpected error while calling Paystack', error);
      throw new InternalServerErrorException(
        error?.message || 'Failed to initialize payment transaction',
      );
    }
  }

  /**
   * Verify a Paystack transaction by reference
   */
  async verifyPayment(reference: string): Promise<PaystackVerifyResponse> {
    this.ensureSecretKeyConfigured();

    if (!reference) {
      throw new BadRequestException('Transaction reference is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const result = await response.json();

      if (!response.ok || !result.status) {
        const errorMsg =
          result.message || 'Payment verification failed at Paystack';
        this.logger.error(`Paystack verify error: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }

      const tx = result.data;

      return {
        reference: tx.reference,
        status: tx.status,
        amount: tx.amount ? tx.amount / 100 : 0, // convert kobo back to standard unit
        currency: tx.currency,
        paidAt: tx.paid_at,
        channel: tx.channel,
        gatewayResponse: tx.gateway_response,
        customer: tx.customer,
        metadata: tx.metadata,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        'Unexpected error while verifying Paystack payment',
        error,
      );
      throw new InternalServerErrorException(
        error?.message || 'Failed to verify payment transaction',
      );
    }
  }

  /**
   * Verify Paystack webhook signature
   */
  verifyWebhookSignature(signature: string, payload: any): boolean {
    if (!this.secretKey || !signature) return false;
    const stringBody =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(stringBody)
      .digest('hex');
    return hash === signature;
  }

  /**
   * Process Paystack Webhook event
   */
  async handleWebhook(body: any, signature?: string) {
    if (signature && !this.verifyWebhookSignature(signature, body)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Paystack webhook event received: ${body?.event}`);
    // Handle events such as charge.success, transfer.success, etc.
    return {
      received: true,
      event: body?.event,
    };
  }
}
