import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { workerUsedSchema } from './worker-used';

// outcome and limit are plain strings, so a release that adds a value still decodes in an older
// one. The erasable field is { detail } on a failure, which came from a service or a model.
export const workerRunEndedCodec = defineRecordCodec(
  'worker.run_ended',
  z.object({
    workerRunID: z.uuid(),
    callID: z.string(),
    taskRunID: z.string().exactOptional(),
    model: z.string(),
    profile: z.string(),
    outcome: z.string(),
    limit: z.string().exactOptional(),
    used: workerUsedSchema,
  }),
);
