import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// The record that binds a definition's ID to its task and holds the hash in force, which is null
// while the definition is out of force.
export const taskDefinitionSetCodec = defineRecordCodec(
  'task.definition_set',
  z.object({
    taskID: z.string(),
    definitionID: z.string(),
    definitionHash: z.string().nullable(),
  }),
);
