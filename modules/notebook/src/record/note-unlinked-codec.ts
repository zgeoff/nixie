import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { linkTargetSchema, linkTypeSchema } from './link-target-schema';

export const noteUnlinkedCodec = defineRecordCodec(
  'notebook.unlinked',
  z.object({ from: z.string(), to: linkTargetSchema, type: linkTypeSchema }),
);
