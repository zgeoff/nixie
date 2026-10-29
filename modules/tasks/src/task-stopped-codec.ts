import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { resumeStateSchema } from './resume-state-schema';

const timerIDsSchema = z.array(z.string());

export const taskStoppedCodec = defineRecordCodec(
  'task.stopped',
  z.object({
    taskID: z.string(),
    stepKey: z.string().nullable(),
    timerIDs: timerIDsSchema,
    resumeState: resumeStateSchema,
  }),
);
