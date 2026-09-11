/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  success: boolean;
  statusCode: number;
  message: string;
  error: string;
  errorDetails?: string | Record<string, unknown>;
  path: string;
  method: string;
  timestamp: string;
  stack?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Handle undefined/null exceptions
    if (!exception) {
      this.logger.error('Caught undefined exception!');
      this.sendErrorResponse(response, {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Unknown error occurred',
        error: 'UnknownError',
        path: request?.url || 'unknown',
        method: request?.method || 'unknown',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const errorResponse = this.buildErrorResponse(exception, request);
    this.sendErrorResponse(response, errorResponse);
    this.logError(request, errorResponse, exception);
  }

  private buildErrorResponse(
    exception: unknown,
    request: Request,
  ): ErrorResponse {
    const baseResponse: ErrorResponse = {
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
      path: request?.url || 'unknown',
      method: request?.method || 'unknown',
      timestamp: new Date().toISOString(),
    };

    // Handle HttpException and its subclasses
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception, baseResponse);
    }

    // Handle Prisma errors
    if (this.isPrismaError(exception)) {
      return this.handlePrismaError(exception, baseResponse);
    }

    // Handle generic errors
    if (exception instanceof Error) {
      return this.handleGenericError(exception, baseResponse);
    }

    // Handle unknown exception types
    return {
      ...baseResponse,
      message: 'An unexpected error occurred',
      error: 'UnexpectedError',
      errorDetails: String(exception),
    };
  }

  private handleHttpException(
    exception: HttpException,
    baseResponse: ErrorResponse,
  ): ErrorResponse {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let errorDetails: string | Record<string, unknown> | undefined;

    if (exception instanceof BadRequestException) {
      ({ message, errorDetails } =
        this.handleBadRequestException(exceptionResponse));
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      message = (exceptionResponse as any).message || 'HTTP exception occurred';
      if (Object.keys(exceptionResponse).length > 1) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { message: _, ...details } = exceptionResponse as any;
        if (Object.keys(details).length > 0) {
          errorDetails = details;
        }
      }
    } else {
      message = 'HTTP exception occurred';
    }

    return {
      ...baseResponse,
      statusCode: status,
      message,
      error: exception.constructor.name,
      errorDetails,
    };
  }

  private handleBadRequestException(
    exceptionResponse: string | Record<string, any>,
  ): {
    message: string;
    errorDetails?: Record<string, unknown>;
  } {
    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse };
    }

    const response = exceptionResponse as {
      message?: string | string[];
      error?: string;
    };
    let message: string;
    let errorDetails: Record<string, unknown> | undefined;

    if (typeof response.message === 'string') {
      message = response.message;
    } else if (Array.isArray(response.message)) {
      message = response.message[0] || 'Validation failed';
      errorDetails = { validationErrors: response.message };
    } else {
      message = response.error || 'Bad request';
    }

    return { message, errorDetails };
  }

  private handlePrismaError(
    exception: any,
    baseResponse: ErrorResponse,
  ): ErrorResponse {
    const errorName = exception.constructor?.name || '';

    // Handle Prisma Client Validation Error
    if (errorName === 'PrismaClientValidationError') {
      return {
        ...baseResponse,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Database validation error',
        error: 'PrismaValidationError',
        errorDetails: this.sanitizePrismaError(
          exception.message || 'Validation failed',
        ),
      };
    }

    // Handle Prisma Client Known Request Error
    if (errorName === 'PrismaClientKnownRequestError') {
      return this.handlePrismaKnownError(exception, baseResponse);
    }

    // Handle Prisma Client Unknown Request Error
    if (errorName === 'PrismaClientUnknownRequestError') {
      return {
        ...baseResponse,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database connection error',
        error: 'PrismaUnknownError',
      };
    }

    // Handle Prisma Client Rust Panic Error
    if (errorName === 'PrismaClientRustPanicError') {
      return {
        ...baseResponse,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database engine error',
        error: 'PrismaRustPanicError',
      };
    }

    // Handle Prisma Client Initialization Error
    if (errorName === 'PrismaClientInitializationError') {
      return {
        ...baseResponse,
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database initialization error',
        error: 'PrismaInitializationError',
      };
    }

    return {
      ...baseResponse,
      message: 'Database error occurred',
      error: 'PrismaClientError',
    };
  }

  private handlePrismaKnownError(
    exception: any,
    baseResponse: ErrorResponse,
  ): ErrorResponse {
    const errorMap: Record<string, { status: number; message: string }> = {
      P2002: {
        status: HttpStatus.CONFLICT,
        message: 'Unique constraint violation',
      },
      P2014: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid relation data',
      },
      P2003: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Foreign key constraint failed',
      },
      P2025: { status: HttpStatus.NOT_FOUND, message: 'Record not found' },
      P2016: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Query interpretation error',
      },
      P2021: { status: HttpStatus.NOT_FOUND, message: 'Table does not exist' },
      P2022: { status: HttpStatus.NOT_FOUND, message: 'Column does not exist' },
    };

    const errorInfo = errorMap[exception.code] || {
      status: HttpStatus.BAD_REQUEST,
      message: 'Database constraint error',
    };

    return {
      ...baseResponse,
      statusCode: errorInfo.status,
      message: errorInfo.message,
      error: 'PrismaKnownRequestError',
      errorDetails: {
        code: exception.code,
        meta: exception.meta,
      },
    };
  }

  private handleGenericError(
    exception: Error,
    baseResponse: ErrorResponse,
  ): ErrorResponse {
    return {
      ...baseResponse,
      message: exception.message || 'An error occurred',
      error: exception.constructor.name,
      ...(process.env.NODE_ENV === 'development' && { stack: exception.stack }),
    };
  }

  private sanitizePrismaError(errorMessage: string): string {
    // Remove potentially sensitive information from Prisma error messages
    return errorMessage
      .replace(/Argument `[\w.]+`:/g, 'Argument:')
      .replace(
        /Invalid value provided\. Expected .+, provided .+\./g,
        'Invalid value provided.',
      )
      .replace(
        /Got invalid value .+ on prisma\.[\w.]+\./g,
        'Invalid value provided.',
      );
  }

  private isPrismaError(exception: unknown): boolean {
    if (!exception || typeof exception !== 'object') {
      return false;
    }

    const errorName = (exception as any).constructor?.name || '';
    const prismaErrorNames = [
      'PrismaClientValidationError',
      'PrismaClientKnownRequestError',
      'PrismaClientUnknownRequestError',
      'PrismaClientRustPanicError',
      'PrismaClientInitializationError',
    ];

    return prismaErrorNames.includes(errorName);
  }

  private sendErrorResponse(
    response: Response,
    errorResponse: ErrorResponse,
  ): void {
    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private logError(
    request: Request,
    errorResponse: ErrorResponse,
    exception: unknown,
  ): void {
    const logMessage = `${request.method} ${request.url} - ${errorResponse.statusCode} ${errorResponse.message}`;

    const logDetails = {
      url: request.url,
      method: request.method,
      statusCode: errorResponse.statusCode,
      message: errorResponse.message,
      error: errorResponse.error,
      userAgent: request.get('user-agent'),
      ip: request.ip,
      ...(errorResponse.errorDetails && {
        errorDetails: errorResponse.errorDetails,
      }),
    };

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : undefined,
        JSON.stringify(logDetails, null, 2),
      );
    } else if (errorResponse.statusCode >= 400) {
      this.logger.warn(logMessage, JSON.stringify(logDetails, null, 2));
    } else {
      this.logger.log(logMessage, JSON.stringify(logDetails, null, 2));
    }
  }
}
