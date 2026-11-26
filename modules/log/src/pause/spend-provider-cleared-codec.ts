import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

export const spendProviderClearedCodec = defineRecordCodec(
  'spend.provider_cleared',
  z.object({ provider: z.string(), reason: z.enum(['reset', 'raised', 'corrected']) }),
);
