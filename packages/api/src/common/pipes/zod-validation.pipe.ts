import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates & narrows input against a zod schema. Applied per-handler via
 * `@Body(new ZodValidationPipe(schema))` so every external input is validated.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}

/** Convenience factory for readability at call sites. */
export const zodBody = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
