import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskMessageMovedCodec = defineRecordCodec(
  'task.message_moved',
  z.object({ message: z.int(), messageThread: z.string(), from: z.string(), to: z.string() }),
);
