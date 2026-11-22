import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { linkTargetSchema, linkTypeSchema } from './link-target-schema';

export const noteLinkedCodec = defineRecordCodec(
  'notebook.linked',
  z.object({ from: z.string(), to: linkTargetSchema, type: linkTypeSchema }),
);
