import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const memoryEvidencePurgeClosedCodec = defineRecordCodec(
  'memory.evidence_purge_closed',
  z.object({
    recordSequence: z.int(),
    itemID: z.string(),
    closedKeyIDs: z.string().array(),
    closedRecordKeyIDs: z.string().array(),
    generationKeyID: z.string().nullable(),
    bridgeVersion: z.int().nullable(),
    labelsRevision: z.int().nullable(),
  }),
);
