import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A rebuilt session, which a log keeps from releases before openings: why the session was rebuilt,
// and the newest recall the lost session saw. nixie writes none of these now.
export const modelSessionRebuiltCodec = defineRecordCodec(
  'model.session_rebuilt',
  z.object({ reason: z.string(), recalledThrough: z.int().nonnegative() }),
);
