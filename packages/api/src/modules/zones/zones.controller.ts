import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createDeliveryZoneSchema,
  createPricingRuleSchema,
  updateDeliveryZoneSchema,
  updatePricingRuleSchema,
  UserRole,
  type CreateDeliveryZoneInput,
  type CreatePricingRuleInput,
  type UpdateDeliveryZoneInput,
  type UpdatePricingRuleInput,
} from '@marhaba/shared';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { ZonesService } from './zones.service';

@Controller('zones')
@UseGuards(RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.MANAGER, UserRole.ADMIN)
  list() {
    return this.zones.listZones();
  }

  @Post()
  create(@Body(zodBody(createDeliveryZoneSchema)) body: CreateDeliveryZoneInput) {
    return this.zones.createZone(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateDeliveryZoneSchema)) body: UpdateDeliveryZoneInput,
  ) {
    return this.zones.updateZone(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.zones.deleteZone(id);
  }

  @Post('pricing-rules')
  createRule(@Body(zodBody(createPricingRuleSchema)) body: CreatePricingRuleInput) {
    return this.zones.createPricingRule(body);
  }

  @Patch('pricing-rules/:id')
  updateRule(
    @Param('id') id: string,
    @Body(zodBody(updatePricingRuleSchema)) body: UpdatePricingRuleInput,
  ) {
    return this.zones.updatePricingRule(id, body);
  }
}
