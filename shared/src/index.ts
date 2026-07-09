export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export enum ServiceName {
  GATEWAY = 'gateway',
  USER_SERVICE = 'user-service',
  ORDER_SERVICE = 'order-service',
  AI_SERVICE = 'ai-service',
}

export interface BaseDto {
  id?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}
