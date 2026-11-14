import { z } from 'zod';
import type { FieldSchema, ReportShape } from './types';

// The keys sit in alphabetical order, because a parse writes them in this order and a pinned shape
// stores its keys sorted.
const fieldSchema: z.ZodType<FieldSchema> = z.lazy(() =>
  z.strictObject({
    additionalProperties: z.literal(false).exactOptional(),
    description: z.string().exactOptional(),
    enum: z.union([z.string(), z.number()]).array().exactOptional(),
    items: fieldSchema.exactOptional(),
    maximum: z.number().exactOptional(),
    maxItems: z.number().exactOptional(),
    maxLength: z.number().exactOptional(),
    minimum: z.number().exactOptional(),
    properties: z.record(z.string(), fieldSchema).exactOptional(),
    required: z.string().array().exactOptional(),
    type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
  }),
);

export const reportShapeSchema = z.strictObject({
  additionalProperties: z.literal(false),
  properties: z.record(z.string(), fieldSchema),
  required: z.string().array().exactOptional(),
  type: z.literal('object'),
}) satisfies z.ZodType<ReportShape>;
