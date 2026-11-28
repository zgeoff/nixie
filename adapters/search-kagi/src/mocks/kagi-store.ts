import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

const keys = new Collection({
  schema: z.object({
    key: z.string().default(() => faker.string.alphanumeric(40)),
  }),
});

// A page the mock's index returns for one exact query.
const results = new Collection({
  schema: z.object({
    query: z.string().default(() => faker.lorem.words(2)),
    url: z.string().default(() => faker.internet.url()),
    title: z.string().default(() => faker.lorem.sentence()),
    snippet: z.string().nullable().default(null),
    time: z.string().nullable().default(null),
  }),
});

// A request that reached the mock, kept in the order it arrived.
const requests = new Collection({
  schema: z.object({
    authorization: z.string().default(''),
  }),
});

const hooks: {
  onRequest: (() => Promise<void>) | null;

  // the status that every request gets in place of a search answer; null answers as usual
  failWith: number | null;
} = { onRequest: null, failWith: null };

export const kagiStore = {
  keys,
  results,
  requests,

  // runs when a request arrives, before the mock answers, so a test sees the state at that moment
  hooks,

  reset: (): void => {
    for (const collection of [results, keys, requests]) {
      collection.clear();
    }

    hooks.onRequest = null;
    hooks.failWith = null;
  },
};
