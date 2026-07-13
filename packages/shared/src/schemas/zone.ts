import { z } from 'zod';
import { lngLatSchema } from './common.js';

/**
 * A delivery zone is a GeoJSON Polygon (array of linear rings, each a closed
 * ring of [lng, lat] pairs). Stored in PostGIS as a geography(Polygon, 4326).
 */
export const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(lngLatSchema).min(4)).min(1),
});
export type Polygon = z.infer<typeof polygonSchema>;

export const deliveryZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  polygon: polygonSchema,
  priority: z.number().int(),
});
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;

export const createDeliveryZoneSchema = z.object({
  name: z.string().min(1).max(120),
  polygon: polygonSchema,
  isActive: z.boolean().default(true),
  // Higher priority wins when zones overlap.
  priority: z.number().int().default(0),
});
export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;

export const updateDeliveryZoneSchema = createDeliveryZoneSchema.partial();
export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;

/** "Which zone am I in?" lookup used at checkout and by dispatch. */
export const zoneLookupSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
export type ZoneLookupInput = z.infer<typeof zoneLookupSchema>;
