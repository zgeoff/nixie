import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const sequence = z.int().positive();

const edgesChange = z.object({
  kind: z.literal('edges'),
  firstSequence: sequence,
  lastSequence: sequence,
});

const reflectionChange = z.object({
  kind: z.literal('reflection'),
  reflectionID: z.string(),
  model: z.string(),
});

const reflectionRemovedChange = z.object({
  kind: z.literal('reflection_removed'),
  reflectionID: z.string(),
});

const change = z.discriminatedUnion('kind', [
  edgesChange,
  z.object({ kind: z.literal('title') }),
  z.object({ kind: z.literal('note') }),
  reflectionChange,
  reflectionRemovedChange,
]);

export const momentEditedCodec = defineRecordCodec(
  'moment_edited',
  z.object({
    momentID: z.string(),
    version: z.int().positive(),
    editedBy: z.enum(['owner', 'model']),
    change,
  }),
);
