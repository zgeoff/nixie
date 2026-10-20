import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The record of your choice for a skill that nixie wrote: keep nixie's version over your
// definitions' change, or keep your definitions' version and retire nixie's.
export const skillsWrittenResolvedCodec = defineRecordCodec(
  'skills.written_resolved',
  z.object({
    approvalID: z.string(),
    name: z.string(),
    keep: z.enum(['nixie', 'definitions']),
  }),
);
