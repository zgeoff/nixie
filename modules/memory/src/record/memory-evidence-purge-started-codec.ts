import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const memoryEvidencePurgeStartedCodec = defineRecordCodec(
  'memory.evidence_purge_started',
  z.object({
    recordSequence: z.int().nullable(),
    itemIDs: z.string().array(),
  }),
);
