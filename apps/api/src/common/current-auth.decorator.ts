import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUserContext } from './auth-context';
import type { AuthenticatedRequest } from './request';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUserContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw new Error('Authenticated context is missing');
    }

    return request.auth;
  },
);
