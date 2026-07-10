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

export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: Date | string;
}

export interface ApiConsumer {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date | string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  consumerId: string;
  expiresAt?: Date | string | null;
  revoked: boolean;
  lastUsedAt?: Date | string | null;
  usageCount: number;
  createdAt: Date | string;
}

export interface AuthenticatedPrincipal {
  type: 'jwt' | 'api-key';
  id?: string;
  userId?: string;
  email?: string;
  role?: string;
  consumerId?: string;
  keyId?: string;
  scopes?: string[];
  [key: string]: any;
}
