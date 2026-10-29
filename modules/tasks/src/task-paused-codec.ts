import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { resumeStateSchema } from './resume-state-schema';

export const taskPausedCodec = defineRecordCodec(
  'task.paused',
  z.object({ taskID: z.string(), resumeState: resumeStateSchema }),
);
