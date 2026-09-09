export interface BaseResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, any>;
}

export interface ResponseOptions<T = any> {
  message: string;
  data?: T;
  success?: boolean;
  meta?: Record<string, any>;
}

export function sendResponse<T>(options: ResponseOptions<T>): BaseResponse<T> {
  return {
    success: options.success ?? true,
    message: options.message,
    ...(options.data !== undefined && { data: options.data }),
    ...(options.meta !== undefined && { meta: options.meta }),
  };
}
