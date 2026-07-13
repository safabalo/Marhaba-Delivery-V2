import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type AuthUser,
  type LoginInput,
  type RegisterInput,
  UserRole,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokensService } from './tokens.service';

export interface IssuedSession {
  user: AuthUser;
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
  ) {}

  async register(input: RegisterInput): Promise<IssuedSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: UserRole.CLIENT, // self-registration is always CLIENT
      },
    });
    return this.issueSession(user);
  }

  async login(input: LoginInput): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    let payload;
    try {
      payload = await this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token');

    const consumed = await this.tokens.consumeRefreshToken(refreshToken);
    if (!consumed) throw new UnauthorizedException('Refresh token revoked or expired');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    return this.issueSession(user);
  }

  async logout(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toAuthUser(user);
  }

  private async issueSession(user: {
    id: string;
    email: string;
    role: UserRole;
    fullName: string;
    phone: string | null;
  }): Promise<IssuedSession> {
    const access = await this.tokens.issueAccessToken(user);
    const refresh = await this.tokens.issueRefreshToken(user);
    return {
      user: this.toAuthUser(user),
      accessToken: access.token,
      accessExpiresIn: access.expiresIn,
      refreshToken: refresh.token,
      refreshExpiresIn: refresh.expiresIn,
    };
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    role: UserRole;
    fullName: string;
    phone: string | null;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      phone: user.phone,
    };
  }
}
