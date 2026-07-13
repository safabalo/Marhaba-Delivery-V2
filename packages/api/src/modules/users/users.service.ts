import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  UserRole,
  type CreateUserInput,
  type UpdateUserInput,
} from '@marhaba/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../auth/password.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  private readonly safeSelect = {
    id: true,
    email: true,
    fullName: true,
    phone: true,
    role: true,
    isActive: true,
    createdAt: true,
  } as const;

  list(role?: UserRole) {
    return this.prisma.user.findMany({
      where: role ? { role } : undefined,
      select: this.safeSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: CreateUserInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role,
        passwordHash,
        // Provision a driver profile alongside DRIVER accounts.
        driverProfile:
          input.role === UserRole.DRIVER ? { create: { status: 'OFFLINE' } } : undefined,
      },
      select: this.safeSelect,
    });
    return user;
  }

  async update(id: string, input: UpdateUserInput) {
    await this.ensure(id);
    return this.prisma.user.update({
      where: { id },
      data: input,
      select: this.safeSelect,
    });
  }

  private async ensure(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!u) throw new NotFoundException('User not found');
  }
}
