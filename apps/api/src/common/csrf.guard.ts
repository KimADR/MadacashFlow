import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { parse } from 'cookie';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const CSRF_COOKIE_NAME = 'madacash_csrf';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const expectedOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const origin = request.get('origin');
    if (origin !== expectedOrigin) {
      throw new ForbiddenException({ code: 'INVALID_ORIGIN', message: 'Origine de requête non autorisée.' });
    }

    const cookieToken = parse(request.headers.cookie ?? '')[CSRF_COOKIE_NAME];
    const headerToken = request.get('x-csrf-token');
    if (!cookieToken || !headerToken) {
      throw new ForbiddenException({ code: 'CSRF_REQUIRED', message: 'Jeton anti-CSRF requis.' });
    }

    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);
    if (
      cookieBuffer.length !== headerBuffer.length ||
      !timingSafeEqual(cookieBuffer, headerBuffer)
    ) {
      throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Jeton anti-CSRF invalide.' });
    }

    return true;
  }
}
