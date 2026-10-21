import { z } from 'zod';

// One route of GitHub's REST API that the definitions export calls. Its path names each parameter
// as `:name`, or `*name` for one that spans segments, such as a branch with slashes.
export interface GitHubOperation {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly path: string;
  readonly query?: z.ZodType<Record<string, string>>;
  readonly request?: z.ZodType;
  readonly response: z.ZodType;
}

const shaSchema = z.object({ sha: z.string() });
const refSchema = z.object({ object: shaSchema });
const pullSchema = z.object({ number: z.number().int(), html_url: z.string() });
const treeListingSchema = z.object({ path: z.string(), type: z.string() });

const pullUpdateSchema = z
  .object({ title: z.string(), body: z.string(), state: z.enum(['open', 'closed']) })
  .partial()
  .strict();

const fileEntrySchema = z.object({
  path: z.string(),
  mode: z.literal('100644'),
  type: z.literal('blob'),
});

// a tree entry writes its content, or removes its path with a null sha
const treeEntrySchema = z.union([
  fileEntrySchema.extend({ content: z.string() }),
  fileEntrySchema.extend({ sha: z.null() }),
]);

// The routes of GitHub's REST API that the definitions export calls, each with the schemas of its
// query, its request body and its answer. The adapter builds each request from it, and the stub of
// GitHub in its tests answers each route by it.
export const githubContract = {
  readRef: {
    method: 'GET',
    path: '/repos/:owner/:name/git/ref/heads/*branch',
    response: refSchema,
  },
  updateRef: {
    method: 'PATCH',
    path: '/repos/:owner/:name/git/refs/heads/*branch',
    request: z.object({ sha: z.string(), force: z.boolean().optional() }),
    response: refSchema,
  },
  createRef: {
    method: 'POST',
    path: '/repos/:owner/:name/git/refs',
    request: z.object({ ref: z.string().startsWith('refs/'), sha: z.string() }),
    response: refSchema,
  },
  readContent: {
    method: 'GET',
    path: '/repos/:owner/:name/contents/*path',
    query: z.object({ ref: z.string() }),
    response: z.object({ content: z.string(), encoding: z.literal('base64') }),
  },
  readTree: {
    method: 'GET',
    path: '/repos/:owner/:name/git/trees/:sha',
    query: z.object({ recursive: z.literal('1') }),
    response: z.object({
      sha: z.string(),
      tree: z.array(treeListingSchema),
      truncated: z.boolean(),
    }),
  },
  createTree: {
    method: 'POST',
    path: '/repos/:owner/:name/git/trees',
    request: z.object({ base_tree: z.string(), tree: z.array(treeEntrySchema) }),
    response: shaSchema,
  },
  readCommit: {
    method: 'GET',
    path: '/repos/:owner/:name/git/commits/:sha',
    response: z.object({ sha: z.string(), tree: shaSchema }),
  },
  createCommit: {
    method: 'POST',
    path: '/repos/:owner/:name/git/commits',
    request: z.object({ message: z.string(), tree: z.string(), parents: z.array(z.string()) }),
    response: shaSchema,
  },
  listPulls: {
    method: 'GET',
    path: '/repos/:owner/:name/pulls',
    query: z.object({ state: z.enum(['open', 'closed']), head: z.string(), base: z.string() }),
    response: z.array(pullSchema),
  },
  createPull: {
    method: 'POST',
    path: '/repos/:owner/:name/pulls',
    request: z.object({ title: z.string(), body: z.string(), head: z.string(), base: z.string() }),
    response: pullSchema,
  },
  updatePull: {
    method: 'PATCH',
    path: '/repos/:owner/:name/pulls/:number',
    request: pullUpdateSchema,
    response: pullSchema,
  },
} as const satisfies Record<string, GitHubOperation>;

// the names of the parameters a path holds
export type GitHubPathParams<Path extends string> =
  Path extends `${string}${':' | '*'}${infer Param}/${infer Rest}`
    ? Param | GitHubPathParams<`/${Rest}`>
    : Path extends `${string}${':' | '*'}${infer Param}`
      ? Param
      : never;
