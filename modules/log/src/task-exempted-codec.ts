import { z } from 'zod';
import { defineRecordCodec } from './define-record-codec';

export const taskExemptedCodec = defineRecordCodec(
  'nixie.task_exempted',
  z.object({ taskID: z.string(), by: z.string() }),
);
