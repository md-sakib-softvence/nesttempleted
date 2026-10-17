import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentService } from '../service/payment.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { sendResponse } from '../../utils/response.util';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) { }

  @Public()
  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create and initialize a Paystack payment session' })
  @ApiResponse({
    status: 200,
    description:
      'Payment initialized successfully. Returns authorization URL and reference.',
  })
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    const data = await this.paymentService.createPayment(createPaymentDto);
    return sendResponse({
      message: 'Payment initialized successfully',
      data,
    });
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize a Paystack payment session (standard REST endpoint)',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment initialized successfully',
  })
  async createPaymentStandard(@Body() createPaymentDto: CreatePaymentDto) {
    const data = await this.paymentService.createPayment(createPaymentDto);
    return sendResponse({
      message: 'Payment initialized successfully',
      data,
    });
  }

  @Public()
  @Get('verify/:reference')
  @ApiOperation({
    summary: 'Verify Paystack payment status by transaction reference',
  })
  @ApiParam({
    name: 'reference',
    description: 'Paystack transaction reference to verify',
    type: String,
    example: 'ref_1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment verification status',
  })
  async verifyPayment(@Param('reference') reference: string) {
    const data = await this.paymentService.verifyPayment(reference);
    return sendResponse({
      message: 'Payment verified successfully',
      data,
    });
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paystack webhook receiver' })
  async handleWebhook(
    @Body() body: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const data = await this.paymentService.handleWebhook(body, signature);
    return sendResponse({
      message: 'Webhook processed successfully',
      data,
    });
  }
}
