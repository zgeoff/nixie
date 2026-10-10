import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

// The log's sequence counter, which a real log keeps per database. reset() starts it again.
const counter = { lastSequence: 0 };

const sessions = new Collection({
  schema: z.object({
    createdAt: z.date().default(() => faker.date.recent()),
    deviceName: z.string().default(() => faker.commerce.productName()),
    lastUsedAt: z.date().default(() => faker.date.recent()),
    revokedAt: z.date().nullable().default(null),
    sessionID: z.uuid().default(() => faker.string.uuid()),
    token: z.string().default(() => faker.string.alphanumeric(43)),
  }),
});

const enrolmentCodes = new Collection({
  schema: z.object({
    // The client action ID of the enrolment that used the code, which answers a retry.
    clientActionID: z.uuid().nullable().default(null),
    code: z.string().default(() => faker.string.alphanumeric(8)),
    expiresAt: z.date().default(() => faker.date.soon()),
    sessionID: z.uuid().nullable().default(null),
  }),
});

const spanSchema = z.object({
  end: z.int(),
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']),
  start: z.int(),
});

const messageSchema = z.object({
  clientMessageId: z.uuid().optional(),
  spans: z.array(spanSchema).optional(),
  text: z.string().default(() => faker.lorem.sentence()),
});

const records = new Collection({
  schema: z.object({
    kind: z.string().default('owner_message'),
    message: messageSchema.optional(),
    recordedAt: z.date().default(() => new Date()),
    sequence: z.int().default(() => {
      counter.lastSequence += 1;

      return counter.lastSequence;
    }),
    thread: z.string().default('conversation'),
  }),
});

// The mock API's state: what nixie's API would hold in its database.
export const store = {
  enrolmentCodes,
  records,

  // Clears records before the sessions and codes they reference; the order is deliberate.
  reset: (): void => {
    records.clear();
    enrolmentCodes.clear();
    sessions.clear();
    counter.lastSequence = 0;
  },
  sessions,
};
