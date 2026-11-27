import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

// An API key that the mock accepts, as the account's HTTP Basic user and password.
const keys = new Collection({
  schema: z.object({
    accountSID: z.string().default('ACtest'),
    keySID: z.string().default(() => `SK${faker.string.hexadecimal({ length: 8, prefix: '' })}`),
    secret: z.string().default(() => faker.string.alphanumeric(32)),
  }),
});

// A message that the account holds, in the order it was created.
const messages = new Collection({
  schema: z.object({
    sid: z.string().default(() => `SM${faker.string.hexadecimal({ length: 12, prefix: '' })}`),
    from: z.string().default('+61400000000'),
    to: z.string().default('+61411111111'),
    body: z.string().default(() => faker.lorem.sentence()),
    direction: z.enum(['inbound', 'outbound-api']).default('inbound'),

    // epoch ms
    sentAt: z.number().default(() => Date.now()),

    // epoch ms when Twilio created the message, which a late webhook puts before its sent time; null
    // takes the sent time
    createdAt: z.number().nullable().default(null),

    // a queued message has a creation time and no sent time
    isQueued: z.boolean().default(false),
  }),
});

// A request that reached the mock, kept in the order it arrived.
const requests = new Collection({
  schema: z.object({
    method: z.string().default('GET'),
    authorization: z.string().default(''),
    search: z.string().default(''),
  }),
});

const hooks: { onRequest: (() => Promise<void>) | null } = { onRequest: null };

export const twilioStore = {
  keys,
  messages,
  requests,

  // runs when a request arrives, before the mock answers, so a test sees the state at that moment
  hooks,

  reset: (): void => {
    for (const collection of [keys, messages, requests]) {
      collection.clear();
    }

    hooks.onRequest = null;
  },
};
