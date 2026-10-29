import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { resumeStateSchema } from './resume-state-schema';

export const taskRestartedCodec = defineRecordCodec(
  'task.restarted',
  z.object({ taskID: z.string(), nextState: resumeStateSchema }),
);
