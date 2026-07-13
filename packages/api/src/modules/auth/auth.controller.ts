import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  COOKIE,
  loginSchema,
  registerSchema,
  type AuthResponse,
} from '@marhaba/shared';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/decorators';
import { RateLimit } from '../../common/guards/rate-limit.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { AuthService, type IssuedSession } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @RateLimit({ limit: 5, windowSeconds: 60, bucket: 'register' })
  async register(
    @Body(zodBody(registerSchema)) body: import('@marhaba/shared').RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.register(body);
    return this.respond(session, res);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSeconds: 60, bucket: 'login' })
  async login(
    @Body(zodBody(loginSchema)) body: import('@marhaba/shared').LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(body);
    return this.respond(session, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = (req.cookies as Record<string, string>)?.[COOKIE.REFRESH_TOKEN];
    if (!token) throw new UnauthorizedException('Missing refresh token');
    const session = await this.auth.refresh(token);
    return this.respond(session, res);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(userId);
    this.clearCookies(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  // --- cookie helpers ------------------------------------------------------

  private respond(session: IssuedSession, res: Response): AuthResponse {
    const secure = this.config.get<boolean>('cookie.secure');
    const domain = this.config.get<string>('cookie.domain');
    const base = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      domain,
      path: '/',
    };
    res.cookie(COOKIE.ACCESS_TOKEN, session.accessToken, {
      ...base,
      maxAge: session.accessExpiresIn * 1000,
    });
    res.cookie(COOKIE.REFRESH_TOKEN, session.refreshToken, {
      ...base,
      // Scoped to the auth routes (global prefix is /api).
      path: '/api/auth',
      maxAge: session.refreshExpiresIn * 1000,
    });
    return {
      user: session.user,
      accessToken: session.accessToken,
      expiresIn: session.accessExpiresIn,
    };
  }

  private clearCookies(res: Response): void {
    res.clearCookie(COOKIE.ACCESS_TOKEN, { path: '/' });
    res.clearCookie(COOKIE.REFRESH_TOKEN, { path: '/api/auth' });
  }
}
