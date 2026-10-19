import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data: any) => {
        // If already formatted using sendResponse ({ success, message, data?, meta? })
        if (
          data &&
          typeof data === 'object' &&
          'message' in data &&
          'success' in data
        ) {
          const res: Record<string, any> = {
            statusCode: data?.statusCode ?? response.statusCode,
            success: data.success,
            message: data.message,
          };
          if (data.data !== undefined) {
            res.data = data.data;
          }
          if (data.meta !== undefined) {
            res.meta = data.meta;
          }
          return res;
        }

        // Check if response has both data and meta (pagination response)
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data
        ) {
          return {
            statusCode: data?.statusCode ?? response.statusCode,
            success: true,
            message: data?.message ?? 'Request successful',
            data: data.data,
            meta: data.meta,
          };
        }

        // Default response format
        return {
          statusCode: data?.statusCode ?? response.statusCode,
          success: true,
          message: data?.message ?? 'Request successful',
          data: data?.data ?? data,
        };
      }),
    );
  }
}
