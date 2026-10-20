import { onTestFinished } from 'bun:test';
import type { z } from 'zod';
import type { GitHubOperation } from '../github-contract';
import { githubContract } from '../github-contract';
import { findGitHubRoute } from './find-github-route';

export interface StubGitHubOptions {
  // owner/name of the one repo it serves, its base branch, and the token it accepts
  readonly repository: string;
  readonly base: string;
  readonly token: string;
}

interface StubGitHubPull {
  readonly number: number;
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed';
}

export interface StubGitHub {
  readonly url: string;

  // puts a file on the base branch as a new commit, as a push to it does
  readonly writeBaseFile: (path: string, text: string) => void;

  // the files at a branch's head, or null when the branch is missing
  readonly readBranchFiles: (branch: string) => ReadonlyMap<string, string> | null;
  readonly readPulls: () => readonly StubGitHubPull[];

  // marks every recursive tree read cut short, as GitHub does past its size limit
  readonly truncateTrees: () => void;
}

interface StubCommit {
  readonly tree: string;
  readonly parents: readonly string[];
}

interface StubState {
  readonly options: StubGitHubOptions;
  readonly trees: Map<string, ReadonlyMap<string, string>>;
  readonly commits: Map<string, StubCommit>;
  readonly refs: Map<string, string>;
  readonly pulls: StubGitHubPull[];
  readonly nextSHA: () => string;
  readonly isTruncated: () => boolean;
}

// A stand-in for GitHub's REST API on a loopback port, over one repo in memory, routed and parsed
// by the adapter's GitHub contract. As GitHub does, it answers another token with 401, a refused
// body with 422, and a missing branch, file or pull request with 404.
export function startStubGitHub(options: StubGitHubOptions): StubGitHub {
  let count = 0;
  let isTruncated = false;

  const state: StubState = {
    options,
    trees: new Map([['tree-0', new Map()]]),
    commits: new Map([['commit-0', { tree: 'tree-0', parents: [] }]]),
    refs: new Map([[options.base, 'commit-0']]),
    pulls: [],
    nextSHA: () => {
      count += 1;

      return count.toString(16).padStart(40, '0');
    },
    isTruncated: () => isTruncated,
  };

  const answerStubRequest = (request: Request) => answerRequest(state, request);
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerStubRequest });

  onTestFinished(() => server.stop(true));

  return {
    url: `http://127.0.0.1:${server.port}`,

    writeBaseFile: (path, text) => {
      const parent = state.refs.get(options.base) ?? 'commit-0';
      const tree = state.nextSHA();
      const commit = state.nextSHA();

      state.trees.set(tree, new Map([...(readBranch(state, options.base) ?? []), [path, text]]));
      state.commits.set(commit, { tree, parents: [parent] });
      state.refs.set(options.base, commit);
    },

    readBranchFiles: (branch) => readBranch(state, branch),
    readPulls: () => [...state.pulls],
    truncateTrees: () => {
      isTruncated = true;
    },
  };
}

// the parameters of the route's path, its query and its body, before the route parses them
interface StubCall {
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

async function answerRequest(state: StubState, request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${state.options.token}`) {
    return Response.json({ message: 'Bad credentials' }, { status: 401 });
  }

  const url = new URL(request.url);

  const route = findGitHubRoute(githubContract, request.method, url.pathname);

  if (
    route === null ||
    `${route.params['owner']}/${route.params['name']}` !== state.options.repository
  ) {
    return notFound();
  }

  const body: unknown = request.method === 'GET' ? null : await request.json();
  const call = { params: route.params, query: url.searchParams, body };

  const answers: Readonly<Record<keyof typeof githubContract, (call: StubCall) => Response>> = {
    readRef: (routed) => answerRefRead(state, routed),
    updateRef: (routed) => answerRefUpdate(state, routed),
    createRef: (routed) => answerNewRef(state, routed),
    readContent: (routed) => answerContent(state, routed),
    readTree: (routed) => answerTreeRead(state, routed),
    createTree: (routed) => answerTree(state, routed),
    readCommit: (routed) => answerCommitRead(state, routed),
    createCommit: (routed) => answerCommit(state, routed),
    listPulls: (routed) => answerPullList(state, routed),
    createPull: (routed) => answerNewPull(state, routed),
    updatePull: (routed) => answerPullUpdate(state, routed),
  };

  return answers[route.name](call);
}

function notFound(): Response {
  return Response.json({ message: 'Not Found' }, { status: 404 });
}

function answerRefRead(state: StubState, call: StubCall): Response {
  const head = state.refs.get(call.params['branch'] ?? '');

  return head === undefined
    ? notFound()
    : answerJSON(githubContract.readRef, { object: { sha: head } });
}

// an answer in the shape the contract gives the operation's response
function answerJSON<Operation extends GitHubOperation>(
  _operation: Operation,
  json: z.input<Operation['response']>,
  status = 200,
): Response {
  return Response.json(json, { status });
}

function answerRefUpdate(state: StubState, call: StubCall): Response {
  const branch = call.params['branch'] ?? '';
  const head = state.refs.get(branch);

  if (head === undefined) {
    return Response.json({ message: 'Reference does not exist' }, { status: 422 });
  }

  const parsed = githubContract.updateRef.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const update = parsed.data;

  if (update.force !== true && !hasAncestor(state, update.sha, head)) {
    return Response.json({ message: 'Update is not a fast forward' }, { status: 422 });
  }

  state.refs.set(branch, update.sha);

  return answerJSON(githubContract.updateRef, { object: { sha: update.sha } });
}

// GitHub refuses a body that lacks a field the route needs, or holds one of the wrong type
function invalidRequest(): Response {
  return Response.json({ message: 'Invalid request' }, { status: 422 });
}

// whether the commit is the ancestor or descends from it, which a fast-forward update needs
function hasAncestor(state: StubState, commit: string, ancestor: string): boolean {
  const pending = [commit];

  const seen = new Set<string>();

  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next === ancestor) {
      return true;
    }

    if (!seen.has(next)) {
      seen.add(next);
      pending.push(...(state.commits.get(next)?.parents ?? []));
    }
  }

  return false;
}

function answerNewRef(state: StubState, call: StubCall): Response {
  const parsed = githubContract.createRef.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;
  const branch = request.ref.replace(/^refs\/heads\//u, '');

  if (state.refs.has(branch)) {
    return Response.json({ message: 'Reference already exists' }, { status: 422 });
  }

  state.refs.set(branch, request.sha);

  return answerJSON(githubContract.createRef, { object: { sha: request.sha } }, 201);
}

function answerContent(state: StubState, call: StubCall): Response {
  const query = githubContract.readContent.query.safeParse(Object.fromEntries(call.query));

  const text = query.success
    ? readRevision(state, query.data.ref)?.get(call.params['path'] ?? '')
    : undefined;

  return text === undefined
    ? notFound()
    : answerJSON(githubContract.readContent, {
        content: Buffer.from(text).toString('base64'),
        encoding: 'base64',
      });
}

// the files at a branch's head or at a commit, as GitHub reads a ref that names either
function readRevision(state: StubState, ref: string): ReadonlyMap<string, string> | null {
  const commit = state.commits.get(ref);

  return commit === undefined ? readBranch(state, ref) : (state.trees.get(commit.tree) ?? null);
}

function readBranch(state: StubState, branch: string): ReadonlyMap<string, string> | null {
  const head = state.refs.get(branch);
  const commit = head === undefined ? undefined : state.commits.get(head);

  return commit === undefined ? null : (state.trees.get(commit.tree) ?? null);
}

// a recursive tree read lists each folder and each file under the commit or tree it names
function answerTreeRead(state: StubState, call: StubCall): Response {
  const sha = call.params['sha'] ?? '';
  const files = state.trees.get(sha) ?? readRevision(state, sha);
  const query = githubContract.readTree.query.safeParse(Object.fromEntries(call.query));

  if (files === null || !query.success) {
    return notFound();
  }

  const folders = new Set(
    [...files.keys()].flatMap((path) =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, index, segments) => segments.slice(0, index + 1).join('/')),
    ),
  );

  return answerJSON(githubContract.readTree, {
    sha,
    tree: [
      ...[...folders].map((path) => ({ path, type: 'tree' })),
      ...[...files.keys()].map((path) => ({ path, type: 'blob' })),
    ],
    truncated: state.isTruncated(),
  });
}

function answerTree(state: StubState, call: StubCall): Response {
  const parsed = githubContract.createTree.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;

  const files = new Map(state.trees.get(request.base_tree));

  for (const entry of request.tree) {
    if ('content' in entry) {
      files.set(entry.path, entry.content);
    } else {
      files.delete(entry.path);
    }
  }

  const sha = state.nextSHA();

  state.trees.set(sha, files);

  return answerJSON(githubContract.createTree, { sha }, 201);
}

function answerCommitRead(state: StubState, call: StubCall): Response {
  const sha = call.params['sha'] ?? '';
  const found = state.commits.get(sha);

  return found === undefined
    ? notFound()
    : answerJSON(githubContract.readCommit, { sha, tree: { sha: found.tree } });
}

function answerCommit(state: StubState, call: StubCall): Response {
  const parsed = githubContract.createCommit.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;
  const sha = state.nextSHA();

  state.commits.set(sha, { tree: request.tree, parents: request.parents });

  return answerJSON(githubContract.createCommit, { sha }, 201);
}

function answerPullList(state: StubState, call: StubCall): Response {
  const query = githubContract.listPulls.query.safeParse(Object.fromEntries(call.query));

  if (!query.success) {
    return invalidRequest();
  }

  const [, head] = query.data.head.split(':');

  const listed = state.pulls.filter(
    (pull) =>
      pull.state === query.data.state && pull.head === head && pull.base === query.data.base,
  );

  return answerJSON(
    githubContract.listPulls,
    listed.map((pull) => toPullJSON(state, pull)),
  );
}

function toPullJSON(state: StubState, pull: StubGitHubPull) {
  return {
    number: pull.number,
    html_url: `https://github.test/${state.options.repository}/pull/${pull.number}`,
    state: pull.state,
  };
}

function answerNewPull(state: StubState, call: StubCall): Response {
  const parsed = githubContract.createPull.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;

  if (state.pulls.some((pull) => pull.head === request.head && pull.state === 'open')) {
    return Response.json({ message: 'A pull request already exists' }, { status: 422 });
  }

  const pull: StubGitHubPull = { number: state.pulls.length + 1, state: 'open', ...request };

  state.pulls.push(pull);

  return answerJSON(githubContract.createPull, toPullJSON(state, pull), 201);
}

function answerPullUpdate(state: StubState, call: StubCall): Response {
  const index = state.pulls.findIndex((pull) => pull.number === Number(call.params['number']));
  const found = state.pulls[index];

  if (found === undefined) {
    return notFound();
  }

  const parsed = githubContract.updatePull.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const update = parsed.data;

  const pull: StubGitHubPull = {
    ...found,
    title: update.title ?? found.title,
    body: update.body ?? found.body,
    state: update.state ?? found.state,
  };

  state.pulls[index] = pull;

  return answerJSON(githubContract.updatePull, toPullJSON(state, pull));
}
