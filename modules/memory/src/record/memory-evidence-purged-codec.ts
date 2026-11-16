import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const memoryEvidencePurgedCodec = defineRecordCodec(
  'memory.evidence_purged',
  z.object({
    recordSequence: z.int(),
    itemID: z.string(),
  }),
);
