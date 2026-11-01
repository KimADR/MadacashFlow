import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { AuthGuard, SESSION_COOKIE_NAME } from '../common/auth.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { CSRF_COOKIE_NAME } from '../common/csrf.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';

const secureCookie = process.env.NODE_ENV === 'production';
const sessionTtlDays = Number(process.env.SESSION_TTL_DAYS ?? 7);
const sessionCookieOptions = {
  httpOnly: true,
  secure: secureCookie,
  sameSite: 'strict' as const,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('csrf')
  getCsrfToken(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    const csrfToken = randomBytes(32).toString('base64url');
    response.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: secureCookie,
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return { csrfToken };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    user: { id: string; email: string };
    expiresAt: string;
    memberships: Array<{ tenantId: string; tenantName: string; role: string }>;
  }> {
    const result = await this.authService.login(dto);
    response.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
      ...sessionCookieOptions,
      maxAge: sessionTtlDays * 24 * 60 * 60 * 1000,
    });

    return {
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
      memberships: result.memberships,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentAuth() auth: AuthenticatedUserContext) {
    const activeMembership = auth.memberships.find(
      (membership) => membership.tenantId === auth.tenantId,
    );

    return {
      user: { id: auth.userId, email: auth.email },
      tenantId: auth.tenantId,
      role: auth.role,
      tenant: activeMembership
        ? { id: activeMembership.tenantId, name: activeMembership.tenantName }
        : null,
      memberships: auth.memberships
        .filter((membership) => membership.isTenantActive)
        .map((membership) => ({
          tenantId: membership.tenantId,
          tenantName: membership.tenantName,
          role: membership.role,
        })),
    };
  }

  @Post('tenant')
  @UseGuards(AuthGuard)
  async selectTenant(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Body() dto: SelectTenantDto,
  ) {
    return { tenant: await this.authService.selectTenant(auth, dto.tenantId) };
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' }> {
    await this.authService.logout(auth);
    response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    response.clearCookie(CSRF_COOKIE_NAME, {
      httpOnly: false,
      secure: secureCookie,
      sameSite: 'strict',
      path: '/',
    });

    return { status: 'ok' };
  }
}
