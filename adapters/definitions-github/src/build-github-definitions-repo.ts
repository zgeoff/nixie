import type { DefinitionsChange, DefinitionsRepo, PullRequestRef } from '@heynixie/definitions';
import { z } from 'zod';
import { GitHubRequestError } from './github-request-error';

export interface GitHubDefinitionsOptions {
  // the definitions repo as owner/name, and the branch each pull request targets
  readonly repository: string;
  readonly base: string;

  // a fine-grained token with contents and pull-requests write on the definitions repo alone
  readonly token: string;

  // GitHub's REST API, or a stand-in for it in tests
  readonly apiURL: string;
}

const contentSchema = z.object({ content: z.string(), encoding: z.literal('base64') });

// Builds the definitions repo on GitHub, through its REST API. A change becomes one commit on the
// base branch's newest commit, which replaces the change's branch with a forced update, so each
// export of a skill carries only its newest version.
export function buildGitHubDefinitionsRepo(options: GitHubDefinitionsOptions): DefinitionsRepo {
  const send = makeGitHubSender(options);
  const repo = `/repos/${options.repository}`;

  return {
    readFile: async (path) => {
      const encoded = path.split('/').map((segment) => encodeURIComponent(segment));

      const file = await allowMissing(
        send({
          method: 'GET',
          path: `${repo}/contents/${encoded.join('/')}?ref=${encodeURIComponent(options.base)}`,
          schema: contentSchema,
        }),
      );

      return file === null ? null : Buffer.from(file.content, 'base64').toString('utf8');
    },

    writePullRequest: async (change) => {
      const commit = await writeChangeCommit(send, repo, options.base, change);

      await writeBranch(send, repo, change.branch, commit);

      return writeOpenPullRequest(send, repo, options, change);
    },

    closePullRequest: async (pullRequestNumber) => {
      await send({
        method: 'PATCH',
        path: `${repo}/pulls/${pullRequestNumber}`,
        body: { state: 'closed' },
        schema: z.unknown(),
      });
    },
  };
}

interface GitHubRequest<Schema extends z.ZodType> {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly path: string;
  readonly body?: unknown;
  readonly schema: Schema;
}

type GitHubSender = <Schema extends z.ZodType>(
  request: GitHubRequest<Schema>,
) => Promise<z.infer<Schema>>;

function makeGitHubSender(options: GitHubDefinitionsOptions): GitHubSender {
  return async (request) => {
    const response = await fetch(`${options.apiURL}${request.path}`, {
      method: request.method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
        'user-agent': 'nixie',
        'x-github-api-version': '2022-11-28',
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new GitHubRequestError(request.method, request.path, response.status, text);
    }

    const parsed = request.schema.safeParse(parseJSON(text));

    if (!parsed.success) {
      throw new GitHubRequestError(request.method, request.path, null, parsed.error.message);
    }

    return parsed.data;
  };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// a lookup that GitHub answers with 404 when it misses, as null
async function allowMissing<Value>(lookup: Promise<Value>): Promise<Value | null> {
  try {
    return await lookup;
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

const shaSchema = z.object({ sha: z.string() });
const refSchema = z.object({ object: shaSchema });
const commitSchema = z.object({ sha: z.string(), tree: shaSchema });

// one commit on the base branch's newest commit that writes and removes the change's files
async function writeChangeCommit(
  send: GitHubSender,
  repo: string,
  base: string,
  change: DefinitionsChange,
): Promise<string> {
  const ref = await send({
    method: 'GET',
    path: `${repo}/git/ref/heads/${base}`,
    schema: refSchema,
  });

  const parent = await send({
    method: 'GET',
    path: `${repo}/git/commits/${ref.object.sha}`,
    schema: commitSchema,
  });

  const entries = [...change.files].map(([path, text]) =>
    text === null
      ? { path, mode: '100644', type: 'blob', sha: null }
      : { path, mode: '100644', type: 'blob', content: text },
  );

  const tree = await send({
    method: 'POST',
    path: `${repo}/git/trees`,
    body: { base_tree: parent.tree.sha, tree: entries },
    schema: shaSchema,
  });

  const commit = await send({
    method: 'POST',
    path: `${repo}/git/commits`,
    body: { message: change.title, tree: tree.sha, parents: [parent.sha] },
    schema: shaSchema,
  });

  return commit.sha;
}

// points the branch at the commit, and creates the branch when it is missing
async function writeBranch(
  send: GitHubSender,
  repo: string,
  branch: string,
  commit: string,
): Promise<void> {
  const existing = await allowMissing(
    send({ method: 'GET', path: `${repo}/git/ref/heads/${branch}`, schema: refSchema }),
  );

  if (existing === null) {
    await send({
      method: 'POST',
      path: `${repo}/git/refs`,
      body: { ref: `refs/heads/${branch}`, sha: commit },
      schema: z.unknown(),
    });

    return;
  }

  await send({
    method: 'PATCH',
    path: `${repo}/git/refs/heads/${branch}`,
    body: { sha: commit, force: true },
    schema: z.unknown(),
  });
}

const pullSchema = z.object({ number: z.number().int(), html_url: z.string() });

// the open pull request from the branch with the change's title and body, opened when none is open
async function writeOpenPullRequest(
  send: GitHubSender,
  repo: string,
  options: GitHubDefinitionsOptions,
  change: DefinitionsChange,
): Promise<PullRequestRef> {
  const [owner] = options.repository.split('/');
  const head = encodeURIComponent(`${owner}:${change.branch}`);

  const [found] = await send({
    method: 'GET',
    path: `${repo}/pulls?state=open&head=${head}&base=${encodeURIComponent(options.base)}`,
    schema: z.array(pullSchema),
  });

  const pull =
    found === undefined
      ? await send({
          method: 'POST',
          path: `${repo}/pulls`,
          body: { title: change.title, body: change.body, head: change.branch, base: options.base },
          schema: pullSchema,
        })
      : await send({
          method: 'PATCH',
          path: `${repo}/pulls/${found.number}`,
          body: { title: change.title, body: change.body },
          schema: pullSchema,
        });

  return { number: pull.number, url: pull.html_url };
}
