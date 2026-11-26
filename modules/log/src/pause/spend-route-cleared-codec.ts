import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

export const spendRouteClearedCodec = defineRecordCodec(
  'spend.route_cleared',
  z.object({ route: z.string(), reason: z.enum(['reset', 'raised']) }),
);
