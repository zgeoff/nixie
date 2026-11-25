import { z } from 'zod';
import { sessionStateSchema } from '../record/session-state-schema';

const factsShape = { session: z.string(), eventKey: z.string(), at: z.string() };

// A SessionEvent as the trigger.task_input record keeps it in its erasable fields.
export const sessionEventSchema = z.discriminatedUnion('kind', [
  z.object({
    ...factsShape,
    kind: z.literal('state'),
    state: sessionStateSchema,
    question: z.string().nullable(),
  }),
  z.object({
    ...factsShape,
    kind: z.literal('answered'),
    messageRef: z.string(),
    answer: z.string(),
  }),
  z.object({
    ...factsShape,
    kind: z.literal('unanswered'),
    messageRef: z.string(),
    reason: z.string(),
  }),
  z.object({
    ...factsShape,
    kind: z.literal('note'),
    label: z.enum(['progress', 'blocked', 'decision']),
    text: z.string(),
  }),
]);
