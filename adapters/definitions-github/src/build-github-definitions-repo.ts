import type { DefinitionsChange, DefinitionsRepo, PullRequestRef } from '@heynixie/definitions';
import { z } from 'zod';
import type { GitHubOperation, GitHubPathParams } from './github-contract';
import { githubContract } from './github-contract';
import { GitHubRequestError } from './github-request-error';
import { toGitHubPath } from './to-github-path';

export interface GitHubDefinitionsOptions {
  // the definitions repo as owner/name, and the branch each pull request targets
  readonly repository: string;
  readonly base: string;

  // a fine-grained token with contents and pull-requests write on the definitions repo alone
  readonly token: string;

  // GitHub's REST API, or a stand-in for it in tests
  readonly apiURL: string;
}

// Builds the definitions repo on GitHub, through its REST API. A change becomes one commit on the
// base revision the export pinned, which replaces the change's branch with a forced update, so
// each export of a skill carries only its newest version.
export function buildGitHubDefinitionsRepo(options: GitHubDefinitionsOptions): DefinitionsRepo {
  const send = makeGitHubSender(options);

  return {
    readBaseRevision: async () => {
      const ref = await send(githubContract.readRef, { params: { branch: options.base } });

      return ref.object.sha;
    },

    readFile: async (path, revision) => {
      const file = await allowMissing(
        send(githubContract.readContent, { params: { path }, query: { ref: revision } }),
      );

      return file === null ? null : Buffer.from(file.content, 'base64').toString('utf8');
    },

    readFolder: async (path, revision) => {
      const tree = await send(githubContract.readTree, {
        params: { sha: revision },
        query: { recursive: '1' },
      });

      // GitHub cuts a recursive tree past its size limit, which would hide a file to remove
      if (tree.truncated) {
        throw new Error(`the tree of ${revision} is too large to read whole`);
      }

      const prefix = `${path}/`;

      return tree.tree
        .filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
        .map((entry) => entry.path.slice(prefix.length));
    },

    writePullRequest: async (change, revision) => {
      const commit = await writeChangeCommit(send, revision, change);

      await writeBranch(send, change.branch, commit);

      return writeOpenPullRequest(send, options, change);
    },

    readOpenPullRequest: (branch) => readBranchPullRequest(send, options, branch),

    closePullRequest: async (pullRequestNumber) => {
      await send(githubContract.updatePull, {
        params: { number: String(pullRequestNumber) },
        body: { state: 'closed' },
      });
    },
  };
}

// the parameters, query and body a route takes, with the repo's owner and name left to the sender
type GitHubInput<Operation extends GitHubOperation> = {
  readonly params: Readonly<
    Record<Exclude<GitHubPathParams<Operation['path']>, 'owner' | 'name'>, string>
  >;
} & (Operation extends { readonly query: z.ZodType }
  ? { readonly query: z.input<Operation['query']> }
  : { readonly query?: undefined }) &
  (Operation extends { readonly request: z.ZodType }
    ? { readonly body: z.input<Operation['request']> }
    : { readonly body?: undefined });

type GitHubSender = <Operation extends GitHubOperation>(
  operation: Operation,
  input: GitHubInput<Operation>,
) => Promise<z.output<Operation['response']>>;

function makeGitHubSender(options: GitHubDefinitionsOptions): GitHubSender {
  const [owner = '', name = ''] = options.repository.split('/');

  return async <Operation extends GitHubOperation>(
    operation: Operation,
    input: GitHubInput<Operation>,
  ): Promise<z.output<Operation['response']>> => {
    const query =
      input.query === undefined ? '' : `?${new URLSearchParams(input.query).toString()}`;

    const path = `${toGitHubPath(operation.path, { ...input.params, owner, name })}${query}`;

    const response = await fetch(`${options.apiURL}${path}`, {
      method: operation.method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
        'user-agent': 'nixie',
        'x-github-api-version': '2022-11-28',
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new GitHubRequestError(operation.method, path, response.status, text);
    }

    const parsed = z.safeParse<Operation['response']>(operation.response, parseJSON(text));

    if (!parsed.success) {
      throw new GitHubRequestError(operation.method, path, null, parsed.error.message);
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

// one commit on the pinned base revision that writes and removes the change's files
async function writeChangeCommit(
  send: GitHubSender,
  revision: string,
  change: DefinitionsChange,
): Promise<string> {
  const parent = await send(githubContract.readCommit, { params: { sha: revision } });

  const entries = [...change.files].map(([path, text]) =>
    text === null
      ? { path, mode: '100644' as const, type: 'blob' as const, sha: null }
      : { path, mode: '100644' as const, type: 'blob' as const, content: text },
  );

  const tree = await send(githubContract.createTree, {
    params: {},
    body: { base_tree: parent.tree.sha, tree: entries },
  });

  const commit = await send(githubContract.createCommit, {
    params: {},
    body: { message: change.title, tree: tree.sha, parents: [parent.sha] },
  });

  return commit.sha;
}

// points the branch at the commit, and creates the branch when it is missing
async function writeBranch(send: GitHubSender, branch: string, commit: string): Promise<void> {
  const existing = await allowMissing(send(githubContract.readRef, { params: { branch } }));

  if (existing === null) {
    await send(githubContract.createRef, {
      params: {},
      body: { ref: `refs/heads/${branch}`, sha: commit },
    });

    return;
  }

  await send(githubContract.updateRef, { params: { branch }, body: { sha: commit, force: true } });
}

// the open pull request from the branch with the change's title and body, opened when none is open
async function writeOpenPullRequest(
  send: GitHubSender,
  options: GitHubDefinitionsOptions,
  change: DefinitionsChange,
): Promise<PullRequestRef> {
  const found = await readBranchPullRequest(send, options, change.branch);

  const pull =
    found === null
      ? await send(githubContract.createPull, {
          params: {},
          body: { title: change.title, body: change.body, head: change.branch, base: options.base },
        })
      : await send(githubContract.updatePull, {
          params: { number: String(found.number) },
          body: { title: change.title, body: change.body },
        });

  return { number: pull.number, url: pull.html_url };
}

// the open pull request from the branch into the base branch, or null when none is open
async function readBranchPullRequest(
  send: GitHubSender,
  options: GitHubDefinitionsOptions,
  branch: string,
): Promise<PullRequestRef | null> {
  const [owner] = options.repository.split('/');

  const [found] = await send(githubContract.listPulls, {
    params: {},
    query: { state: 'open', head: `${owner}:${branch}`, base: options.base },
  });

  return found === undefined ? null : { number: found.number, url: found.html_url };
}
