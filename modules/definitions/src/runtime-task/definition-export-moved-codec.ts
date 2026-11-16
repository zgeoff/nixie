import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const pullRequestSchema = z.object({ number: z.int(), url: z.string() });

export const definitionExportMovedCodec = defineRecordCodec(
  'definition.export_moved',
  z.object({
    exportID: z.string(),
    branch: z.string(),
    to: z.enum(['exporting', 'opened', 'closed']),
    pullRequest: pullRequestSchema.nullable(),
  }),
);
