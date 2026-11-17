import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const spendStopClearedCodec = defineRecordCodec(
  'spend.stop_cleared',
  z.object({ reason: z.enum(['reset', 'raised', 'reachable', 'lost_cleared']) }),
);
