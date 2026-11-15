import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';
import { mockSequence } from './mock-sequence';

const unknownReasonSchema = z.enum([
  'inconclusive',
  'unknown_streak',
  'no_reconcile',
  'key_expired',
  'not_found_ask',
]);

const attemptSchema = z.object({ attempt: z.int().nonnegative(), at: z.date() });
const fieldsSchema = z.record(z.string(), z.string());

const checkSchema = z.object({
  answer: z.enum(['found', 'not_found', 'inconclusive']),
  at: z.date(),
});

// An action that waits on the owner because its outcome is unknown, as the host lists it.
export const unknownOutcomeRows = new Collection({
  schema: z.object({
    actionID: z.uuid().default(() => faker.string.uuid()),
    attempts: z.array(attemptSchema).default(() => [{ attempt: 1, at: faker.date.recent() }]),
    becameUnknownAt: z.date().default(() => faker.date.recent()),
    checks: z.array(checkSchema).default(() => []),
    fields: fieldsSchema.default(() => ({ to: 'team', text: 'Boat is ready' })),
    reason: unknownReasonSchema.default('no_reconcile'),
    riskClass: z.enum(['routine', 'always_ask', 'lifting']).default('routine'),
    sentence: z.string().default('Run mail.send to team (send).'),
    sequence: z.int().default(() => {
      mockSequence.lastSequence += 1;

      return mockSequence.lastSequence;
    }),
    state: z.enum(['waiting', 'happened', 'retried', 'dropped']).default('waiting'),
    taskID: z.string().nullable().default(null),
    tool: z.string().default('mail.send'),
  }),
});
