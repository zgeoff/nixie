import { z } from 'zod';
import { captureIDPattern } from './capture-tag';

export const spoolMissSchema = z.strictObject({
  version: z.literal(1),
  captureID: z.string().regex(captureIDPattern),
  writer: z.string().regex(/^[0-9a-f]+$/u),
  counter: z.int().min(1),
  reason: z.enum(['queue_full', 'spool_full', 'spool_write_failed', 'seal_failed']),
});

export type SpoolMiss = z.infer<typeof spoolMissSchema>;
