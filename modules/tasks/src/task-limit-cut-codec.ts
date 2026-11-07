import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskLimitCutCodec = defineRecordCodec(
  'task.limit_cut',
  z.object({ taskID: z.string() }),
);
