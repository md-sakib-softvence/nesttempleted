import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { InitializePaymentDto } from '../dto/initialize-payment.dto';

export interface FlutterwaveInitResponse {
  link: string;
  txRef: string;
  currency: string;
  amount: number;
}

export interface FlutterwaveVerifyResponse {
  id: number;
  txRef: string;
  flwRef: string;
  status: string;
  amount: number;
  chargedAmount: number;
  currency: string;
  paymentType?: string;
  createdAt?: string;
  customer?: Record<string, any>;
  card?: Record<string, any>;
  meta?: Record<string, any>;
  raw?: Record<string, any>;
}

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly secretHash: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('flutterwave.secretKey') ||
      process.env.FLUTTERWAVE_SECRET_KEY ||
      '';
    this.publicKey =
      this.configService.get<string>('flutterwave.publicKey') ||
      process.env.FLUTTERWAVE_PUBLIC_KEY ||
      '';
    this.secretHash =
      this.configService.get<string>('flutterwave.secretHash') ||
      process.env.FLUTTERWAVE_SECRET_HASH ||
      '';
    this.baseUrl =
      this.configService.get<string>('flutterwave.baseUrl') ||
      process.env.FLUTTERWAVE_BASE_URL ||
      'https://api.flutterwave.com/v3';
  }

  private ensureSecretKeyConfigured(): void {
    if (!this.secretKey) {
      this.logger.error(
        'FLUTTERWAVE_SECRET_KEY is not defined in environment variables',
      );
      throw new InternalServerErrorException(
        'Flutterwave payment gateway is not properly configured on this server.',
      );
    }
  }

  /**
   * Initialize a new Flutterwave payment checkout session
   */
  async initializePayment(
    dto: InitializePaymentDto,
  ): Promise<FlutterwaveInitResponse> {
    this.ensureSecretKeyConfigured();

    const txRef =
      dto.txRef || `FLW-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const currency = dto.currency || 'NGN';

    const payload: Record<string, any> = {
      tx_ref: txRef,
      amount: dto.amount,
      currency,
      customer: {
        email: dto.email,
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.phoneNumber ? { phonenumber: dto.phoneNumber } : {}),
      },
    };

    if (dto.redirectUrl) {
      payload.redirect_url = dto.redirectUrl;
    }

    if (dto.paymentOptions) {
      payload.payment_options = dto.paymentOptions;
    }

    if (dto.title || dto.description || dto.logo) {
      payload.customizations = {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.logo ? { logo: dto.logo } : {}),
      };
    }

    if (dto.meta) {
      payload.meta = dto.meta;
    }

    try {
      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        const errorMsg =
          result.message || 'Payment initialization failed at Flutterwave';
        this.logger.error(`Flutterwave initialize error: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }

      return {
        link: result.data.link,
        txRef,
        currency,
        amount: dto.amount,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Unexpected error while calling Flutterwave', error);
      throw new InternalServerErrorException(
        error?.message || 'Failed to initialize payment transaction',
      );
    }
  }

  /**
   * Verify a Flutterwave payment transaction by numeric ID
   */
  async verifyTransaction(
    transactionId: string | number,
  ): Promise<FlutterwaveVerifyResponse> {
    this.ensureSecretKeyConfigured();

    if (!transactionId) {
      throw new BadRequestException('Transaction ID is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/transactions/${encodeURIComponent(transactionId)}/verify`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        const errorMsg =
          result.message || 'Payment verification failed at Flutterwave';
        this.logger.error(`Flutterwave verify error: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }

      const tx = result.data;

      return {
        id: tx.id,
        txRef: tx.tx_ref,
        flwRef: tx.flw_ref,
        status: tx.status,
        amount: tx.amount,
        chargedAmount: tx.charged_amount,
        currency: tx.currency,
        paymentType: tx.payment_type,
        createdAt: tx.created_at,
        customer: tx.customer,
        card: tx.card,
        meta: tx.meta,
        raw: tx,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Unexpected error while verifying Flutterwave payment', error);
      throw new InternalServerErrorException(
        error?.message || 'Failed to verify payment transaction',
      );
    }
  }

  /**
   * Verify a Flutterwave transaction by custom transaction reference (tx_ref)
   */
  async verifyTransactionByRef(txRef: string): Promise<FlutterwaveVerifyResponse> {
    this.ensureSecretKeyConfigured();

    if (!txRef) {
      throw new BadRequestException('Transaction reference (tx_ref) is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        const errorMsg =
          result.message || 'Payment verification failed at Flutterwave';
        this.logger.error(`Flutterwave verify by ref error: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }

      const tx = result.data;

      return {
        id: tx.id,
        txRef: tx.tx_ref,
        flwRef: tx.flw_ref,
        status: tx.status,
        amount: tx.amount,
        chargedAmount: tx.charged_amount,
        currency: tx.currency,
        paymentType: tx.payment_type,
        createdAt: tx.created_at,
        customer: tx.customer,
        card: tx.card,
        meta: tx.meta,
        raw: tx,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error('Unexpected error while verifying Flutterwave payment by reference', error);
      throw new InternalServerErrorException(
        error?.message || 'Failed to verify payment transaction',
      );
    }
  }

  /**
   * Verify the Flutterwave webhook secret hash
   */
  verifyWebhookHash(receivedHash?: string): boolean {
    if (!this.secretHash) {
      // If no secret hash configured, accept with a warning log
      this.logger.warn(
        'FLUTTERWAVE_SECRET_HASH is not configured. Webhook hash verification skipped.',
      );
      return true;
    }
    return Boolean(receivedHash && receivedHash === this.secretHash);
  }

  /**
   * Handle incoming Flutterwave Webhook events
   */
  async handleWebhook(body: any, receivedHash?: string) {
    if (!this.verifyWebhookHash(receivedHash)) {
      throw new UnauthorizedException('Invalid Flutterwave webhook hash signature');
    }

    this.logger.log(`Flutterwave webhook event received: ${body?.event || 'unknown'}`);

    // If event is charge.completed, extract transaction data
    const event = body?.event;
    const data = body?.data;

    return {
      received: true,
      event,
      data,
    };
  }

  /**
   * Fetch supported banks for a given country (e.g. 'NG', 'GH', 'KE')
   */
  async getBanks(country: string = 'NG') {
    this.ensureSecretKeyConfigured();

    try {
      const response = await fetch(
        `${this.baseUrl}/banks/${encodeURIComponent(country)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new BadRequestException(result.message || 'Failed to fetch banks');
      }

      return result.data;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Failed to retrieve bank list');
    }
  }
}
