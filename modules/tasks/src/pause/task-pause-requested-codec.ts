import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskPauseRequestedCodec = defineRecordCodec(
  'task.pause_requested',
  z.object({ taskID: z.string(), stepKey: z.string() }),
);
