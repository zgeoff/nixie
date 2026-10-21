import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

// a repo the mock serves, the token it accepts, and whether it cuts each recursive tree read short,
// as GitHub does past its size limit
const repos = new Collection({
  schema: z.object({
    repository: z
      .string()
      .default(() => `${faker.internet.username()}/${faker.lorem.slug({ min: 1, max: 2 })}`),
    token: z.string().default(() => faker.string.alphanumeric(40)),
    isTruncated: z.boolean().default(false),
  }),
});

// the text of each file of a tree by its path from the repo's root
const filesSchema = z.record(z.string(), z.string());

const trees = new Collection({
  schema: z.object({
    sha: z.string().default(() => faker.git.commitSha()),
    files: filesSchema.default({}),
  }),
});

const parentsSchema = z.array(z.string());

const commits = new Collection({
  schema: z.object({
    sha: z.string().default(() => faker.git.commitSha()),
    tree: z.string().default(() => faker.git.commitSha()),
    parents: parentsSchema.default([]),
  }),
});

// a branch of a repo and the commit at its head
const refs = new Collection({
  schema: z.object({
    repository: z.string().default(() => faker.lorem.slug()),
    branch: z.string().default(() => faker.git.branch()),
    sha: z.string().default(() => faker.git.commitSha()),
  }),
});

const pulls = new Collection({
  schema: z.object({
    repository: z.string().default(() => faker.lorem.slug()),
    number: z
      .int()
      .positive()
      .default(() => faker.number.int({ min: 1, max: 999 })),
    head: z.string().default(() => faker.git.branch()),
    base: z.string().default('main'),
    title: z.string().default(() => faker.lorem.sentence()),
    body: z.string().default(() => faker.lorem.paragraph()),
    state: z.enum(['open', 'closed']).default('open'),
  }),
});

// The mock GitHub's state: the repos it serves, their git objects and branches, and their pull
// requests.
export const githubStore = {
  repos,
  trees,
  commits,
  refs,
  pulls,

  // no collection references another's records, so the order is free
  reset: (): void => {
    for (const collection of [pulls, refs, commits, trees, repos]) {
      collection.clear();
    }
  },
};
