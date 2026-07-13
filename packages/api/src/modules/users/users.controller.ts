import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createUserSchema,
  updateUserSchema,
  UserRole,
  type CreateUserInput,
  type UpdateUserInput,
} from '@marhaba/shared';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('role') role?: UserRole) {
    return this.users.list(role);
  }

  @Post()
  create(@Body(zodBody(createUserSchema)) body: CreateUserInput) {
    return this.users.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zodBody(updateUserSchema)) body: UpdateUserInput) {
    return this.users.update(id, body);
  }
}
