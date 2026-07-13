import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import type { JwtPayload, UserRole } from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Issues/verifies access & refresh tokens and persists refresh-token hashes. */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueAccessToken(user: { id: string; email: string; role: UserRole }): Promise<{
    token: string;
    expiresIn: number;
  }> {
    const expiresIn = this.config.get<number>('jwt.accessTtl')!;
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get('jwt.accessSecret'),
      expiresIn,
    });
    return { token, expiresIn };
  }

  /** Issues a refresh token and stores its hash (rotation-friendly). */
  async issueRefreshToken(user: { id: string; email: string; role: UserRole }): Promise<{
    token: string;
    expiresIn: number;
  }> {
    const expiresIn = this.config.get<number>('jwt.refreshTtl')!;
    const jti = randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
      jti,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get('jwt.refreshSecret'),
      expiresIn,
    });
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });
    return { token, expiresIn };
  }

  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.get('jwt.refreshSecret'),
    });
  }

  /** Ensures a refresh token is known and not revoked; then rotates it. */
  async consumeRefreshToken(token: string): Promise<boolean> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) return false;
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
