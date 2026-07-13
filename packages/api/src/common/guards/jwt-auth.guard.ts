import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { COOKIE, jwtPayloadSchema, type UserRole } from '@marhaba/shared';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Verifies the access JWT from the httpOnly cookie (or Authorization bearer,
 * for native/driver clients). Routes marked @Public() are skipped.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing access token');

    try {
      const raw = await this.jwt.verifyAsync(token, {
        secret: this.config.get('jwt.accessSecret'),
      });
      const payload = jwtPayloadSchema.parse(raw);
      if (payload.type !== 'access') throw new Error('wrong token type');
      (req as Request & { user: AuthenticatedUser }).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(req: Request): string | null {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[COOKIE.ACCESS_TOKEN];
    if (cookieToken) return cookieToken;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }
}
