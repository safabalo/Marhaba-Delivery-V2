import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ActorType,
  assignOrderSchema,
  cancelOrderSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  OrderStatus,
  transitionOrderSchema,
  UserRole,
  type AssignOrderInput,
  type CancelOrderInput,
  type CreateOrderInput,
  type ListOrdersQuery,
  type TransitionOrderInput,
} from '@marhaba/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimit } from '../../common/guards/rate-limit.guard';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { AssignmentService } from './assignment.service';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly assignment: AssignmentService,
  ) {}

  @Post()
  @Roles(UserRole.CLIENT)
  @UseInterceptors(IdempotencyInterceptor)
  @RateLimit({ limit: 20, windowSeconds: 60, bucket: 'order-create' })
  create(
    @CurrentUser('id') clientId: string,
    @Body(zodBody(createOrderSchema)) body: CreateOrderInput,
  ) {
    return this.orders.create(clientId, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listOrdersQuerySchema)) query: ListOrdersQuery,
  ) {
    return this.orders.list(query, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.findForUser(id, user);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.orders.timeline(id);
  }

  @Post(':id/place')
  @Roles(UserRole.CLIENT)
  place(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.place(id, user);
  }

  // --- Staff / dispatcher intervention ------------------------------------

  @Post(':id/transition')
  @Roles(UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN, UserRole.DRIVER)
  transition(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(transitionOrderSchema)) body: TransitionOrderInput,
  ) {
    return this.orders.transition(id, body, {
      type: user.role as ActorType,
      id: user.id,
    });
  }

  @Post(':id/assign')
  @Roles(UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  assign(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body(zodBody(assignOrderSchema)) body: AssignOrderInput,
  ) {
    return this.assignment.assign(id, body, actorId);
  }

  @Post(':id/unassign')
  @Roles(UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  unassign(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.assignment.unassign(id, actorId);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(cancelOrderSchema)) body: CancelOrderInput,
  ) {
    return this.orders.transition(
      id,
      { to: OrderStatus.CANCELLED, reason: body.reason },
      { type: user.role as ActorType, id: user.id },
    );
  }
}
