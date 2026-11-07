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

export const kagiStore = {
  keys,
  results,

  reset: (): void => {
    for (const collection of [results, keys]) {
      collection.clear();
    }
  },
};
