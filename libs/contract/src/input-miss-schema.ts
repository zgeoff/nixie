import { z } from 'zod';

export const inputMissSchema = z.object({
  missID: z.string(),
  captureID: z.string().nullable(),
  taskID: z.string(),
  stepRunID: z.string(),
  reason: z.enum([
    'queue_full',
    'spool_full',
    'spool_write_failed',
    'seal_failed',
    'no_capture_point',
    'not_received',
    'undecodable',
    'capture_closed',
    'intake_failed',
    'holds_own_value',
  ]),
  count: z.int().positive(),
  writer: z.string().nullable(),
  counter: z.int().nullable(),
  createdAt: z.date(),
});
