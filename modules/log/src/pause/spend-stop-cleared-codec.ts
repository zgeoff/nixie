import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

export const spendStopClearedCodec = defineRecordCodec(
  'spend.stop_cleared',
  z.object({ reason: z.enum(['reset', 'raised', 'reachable', 'lost_cleared']) }),
);
