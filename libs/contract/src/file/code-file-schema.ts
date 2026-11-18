import { z } from 'zod';
import { threadSchema } from '../contract/thread-schema';

export const codeFileSchema = z.object({
  file: z.string().min(1).max(100),
  name: z.string(),
  bytes: z.int().nonnegative(),
  mediaType: z.string(),
  recordedAt: z.date(),

  // the thread of the run, and the sequence and position of the file in its result record
  thread: threadSchema,
  sequence: z.int().positive(),
  position: z.int().nonnegative(),
  isSent: z.boolean(),
  runFileCount: z.int().positive(),

  // the task of the thread, or null for the conversation
  taskID: threadSchema.nullable(),
  taskName: z.string().nullable(),
});
