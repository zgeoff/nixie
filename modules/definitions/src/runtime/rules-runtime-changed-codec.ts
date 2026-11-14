import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const rulesRuntimeChangedCodec = defineRecordCodec(
  'rules.runtime_changed',
  z.object({
    changeID: z.string(),
    ruleID: z.string(),
    ruleHash: z.string().nullable(),
    sentence: z.string().nullable(),
    changedBy: z.enum(['owner', 'nixie']),
    reason: z.string(),
  }),
);
