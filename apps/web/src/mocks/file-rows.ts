import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

// A code-run file that the owner reads through files.read. A forgotten one answers as a forget does.
export const fileRows = new Collection({
  schema: z.object({
    data: z.base64().default(() => faker.string.alphanumeric(8)),
    file: z.string().default(() => faker.string.alphanumeric(10)),
    isForgotten: z.boolean().default(false),
    isSent: z.boolean().default(false),
    mediaType: z.string().default('application/octet-stream'),
    name: z.string().default(() => faker.system.commonFileName()),
    position: z.int().default(0),
    recordedAt: z.date().default(() => faker.date.recent()),
    sequence: z.int().default(1),
    thread: z.string().default('conversation'),
  }),
});
