import type { Request } from 'express';

export interface RequestWithContext extends Request {
  requestId?: string;
}

export interface AuthenticatedAdmin {
  sessionId: string;
  user: { id: string; email: string; platformRole: 'PLATFORM_ADMIN' };
}

export interface AuthenticatedUser {
  sessionId: string;
  user: {
    id: string;
    email: string;
    platformRole: 'PLATFORM_ADMIN' | null;
    emailVerified: boolean;
  };
}
