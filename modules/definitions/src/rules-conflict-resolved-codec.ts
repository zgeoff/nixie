import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const rulesConflictResolvedCodec = defineRecordCodec(
  'rules.conflict_resolved',
  z.object({ changeID: z.string(), ruleID: z.string(), keep: z.enum(['nixie', 'repo']) }),
);
