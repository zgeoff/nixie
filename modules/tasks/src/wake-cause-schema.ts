import { z } from 'zod';
import type { WakeCause } from './types';

export const wakeCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('owner') }),
  z.object({ kind: z.literal('timer') }),
  z.object({ kind: z.literal('event') }),
  z.object({ kind: z.literal('task'), taskID: z.string() }),
  z.object({ kind: z.literal('carried') }),
]) satisfies z.ZodType<WakeCause>;
