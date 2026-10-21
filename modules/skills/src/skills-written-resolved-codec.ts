import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const skillsWrittenResolvedCodec = defineRecordCodec(
  'skills.written_resolved',
  z.object({
    approvalID: z.string(),
    name: z.string(),
    keep: z.enum(['nixie', 'definitions']),
  }),
);
