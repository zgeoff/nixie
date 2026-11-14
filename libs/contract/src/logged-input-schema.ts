import { z } from 'zod';

// One logged request, from the table's columns. It never carries a key ID, a body or the sealed key.
export const loggedInputSchema = z.object({
  inputID: z.string(),
  captureID: z.string(),
  taskID: z.string(),
  stepRunID: z.string(),
  writer: z.string(),
  counter: z.int(),
  role: z.string(),
  profile: z.string(),
  model: z.string(),
  harness: z.string(),
  api: z.string(),
  endpoint: z.string(),
  route: z.string(),
  isRewritten: z.boolean(),
  upstreamStatus: z.int(),
  bytes: z.int(),
  intakeSequence: z.int(),
  receivedAt: z.date(),
  takenAt: z.date(),
  state: z.enum(['writing', 'stored', 'missing', 'removed']),
  removedCause: z
    .enum(['retention_days', 'retention_bytes', 'forget', 'dropped', 'restore', 'reset'])
    .nullable(),
});
