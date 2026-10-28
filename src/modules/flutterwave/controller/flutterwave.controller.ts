import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { FlutterwaveService } from '../service/flutterwave.service';
import { InitializePaymentDto } from '../dto/initialize-payment.dto';
import { sendResponse } from '../../utils/response.util';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('flutterwave')
@Controller('flutterwave')
export class FlutterwaveController {
  constructor(private readonly flutterwaveService: FlutterwaveService) {}

  @Public()
  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize a Flutterwave payment checkout session',
  })
  @ApiResponse({
    status: 200,
    description:
      'Payment session initialized. Returns hosted checkout link and txRef.',
  })
  async initializePayment(@Body() dto: InitializePaymentDto) {
    const data = await this.flutterwaveService.initializePayment(dto);
    return sendResponse({
      message: 'Flutterwave payment initialized successfully',
      data,
    });
  }

  @Public()
  @Post('create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize a Flutterwave payment checkout session (alias)',
  })
  async createPayment(@Body() dto: InitializePaymentDto) {
    const data = await this.flutterwaveService.initializePayment(dto);
    return sendResponse({
      message: 'Flutterwave payment initialized successfully',
      data,
    });
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Initialize a Flutterwave payment session (standard REST endpoint)',
  })
  async createStandard(@Body() dto: InitializePaymentDto) {
    const data = await this.flutterwaveService.initializePayment(dto);
    return sendResponse({
      message: 'Flutterwave payment initialized successfully',
      data,
    });
  }

  @Public()
  @Get('verify/:id')
  @ApiOperation({
    summary: 'Verify Flutterwave payment transaction by numeric transaction ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Flutterwave transaction ID to verify',
    type: String,
    example: '2882001',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment verification status and details',
  })
  async verifyPayment(@Param('id') id: string) {
    const data = await this.flutterwaveService.verifyTransaction(id);
    return sendResponse({
      message: 'Flutterwave payment verified successfully',
      data,
    });
  }

  @Public()
  @Get('verify-by-ref/:reference')
  @ApiOperation({
    summary:
      'Verify Flutterwave payment status by custom transaction reference (tx_ref)',
  })
  @ApiParam({
    name: 'reference',
    description: 'Custom transaction reference (tx_ref)',
    type: String,
    example: 'FLW-1718000000-abcd1234',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment verification status and details',
  })
  async verifyByRef(@Param('reference') reference: string) {
    const data =
      await this.flutterwaveService.verifyTransactionByRef(reference);
    return sendResponse({
      message: 'Flutterwave payment verified successfully by reference',
      data,
    });
  }

  @Public()
  @Get('banks')
  @ApiOperation({
    summary: 'Retrieve supported banks list for a country',
  })
  @ApiQuery({
    name: 'country',
    required: false,
    example: 'NG',
    description: 'Two-letter ISO country code (e.g. NG, GH, KE)',
  })
  async getBanks(@Query('country') country?: string) {
    const data = await this.flutterwaveService.getBanks(country || 'NG');
    return sendResponse({
      message: 'Banks fetched successfully',
      data,
    });
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Flutterwave webhook notification receiver',
  })
  @ApiHeader({
    name: 'verif-hash',
    required: false,
    description: 'Secret hash configured in Flutterwave webhook settings',
  })
  async handleWebhook(
    @Body() body: any,
    @Headers('verif-hash') verifHash?: string,
  ) {
    const data = await this.flutterwaveService.handleWebhook(body, verifHash);
    return sendResponse({
      message: 'Flutterwave webhook processed successfully',
      data,
    });
  }
}
