import { onTestFinished } from 'bun:test';

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
}

// A stand-in for the part of GitHub's REST API that the definitions export calls, on a loopback
// port, over one repo it keeps in memory. It answers another token with 401, and a missing branch,
// file or pull request with 404, as GitHub does. It stops when the test finishes.
export function startStubGitHub(options: StubGitHubOptions): StubGitHub {
  let count = 0;

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
  };
}

async function answerRequest(state: StubState, request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${state.options.token}`) {
    return Response.json({ message: 'Bad credentials' }, { status: 401 });
  }

  const url = new URL(request.url);

  const prefix = `/repos/${state.options.repository}/`;

  if (!url.pathname.startsWith(prefix)) {
    return notFound();
  }

  const route = `${request.method} ${url.pathname.slice(prefix.length)}`;
  const body: unknown = request.method === 'GET' ? null : await request.json();

  return answerRoute(state, route, url.searchParams, body);
}

function notFound(): Response {
  return Response.json({ message: 'Not Found' }, { status: 404 });
}

function answerRoute(
  state: StubState,
  route: string,
  query: URLSearchParams,
  body: unknown,
): Response {
  const content = /^GET contents\/(?<path>.+)$/u.exec(route)?.groups?.['path'];

  if (content !== undefined) {
    const text = readBranch(state, query.get('ref') ?? '')?.get(decodeURIComponent(content));

    return text === undefined
      ? notFound()
      : Response.json({ content: Buffer.from(text).toString('base64'), encoding: 'base64' });
  }

  const ref = /^(?<method>GET|PATCH) git\/refs?\/heads\/(?<branch>.+)$/u.exec(route)?.groups;

  if (ref?.['branch'] !== undefined) {
    return answerRef(state, ref['method'] === 'PATCH', ref['branch'], body);
  }

  const commit = /^GET git\/commits\/(?<sha>.+)$/u.exec(route)?.groups?.['sha'];

  if (commit !== undefined) {
    const found = state.commits.get(commit);

    return found === undefined
      ? notFound()
      : Response.json({ sha: commit, tree: { sha: found.tree } });
  }

  const pull = /^PATCH pulls\/(?<number>\d+)$/u.exec(route)?.groups?.['number'];

  if (pull !== undefined) {
    return answerPullUpdate(state, Number(pull), body);
  }

  const answers: Readonly<Record<string, () => Response>> = {
    'POST git/trees': () => answerTree(state, body),
    'POST git/commits': () => answerCommit(state, body),
    'POST git/refs': () => answerNewRef(state, body),
    'GET pulls': () => answerPullList(state, query),
    'POST pulls': () => answerNewPull(state, body),
  };

  return answers[route]?.() ?? notFound();
}

function readBranch(state: StubState, branch: string): ReadonlyMap<string, string> | null {
  const head = state.refs.get(branch);
  const commit = head === undefined ? undefined : state.commits.get(head);

  return commit === undefined ? null : (state.trees.get(commit.tree) ?? null);
}

function answerRef(state: StubState, isUpdate: boolean, branch: string, body: unknown): Response {
  const head = state.refs.get(branch);

  if (head === undefined) {
    return isUpdate
      ? Response.json({ message: 'Reference does not exist' }, { status: 422 })
      : notFound();
  }

  if (!isUpdate) {
    return Response.json({ object: { sha: head } });
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the adapter under test sends it
  const update = body as { sha: string; force?: boolean };

  state.refs.set(branch, update.sha);

  return Response.json({ object: { sha: update.sha } });
}

function answerPullUpdate(state: StubState, pullNumber: number, body: unknown): Response {
  const index = state.pulls.findIndex((pull) => pull.number === pullNumber);
  const found = state.pulls[index];

  if (found === undefined) {
    return notFound();
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the adapter under test sends it
  const update = body as Partial<Pick<StubGitHubPull, 'title' | 'body' | 'state'>>;
  const pull = { ...found, ...update };

  state.pulls[index] = pull;

  return Response.json(toPullJSON(state, pull));
}

function toPullJSON(state: StubState, pull: StubGitHubPull) {
  return {
    number: pull.number,
    html_url: `https://github.test/${state.options.repository}/pull/${pull.number}`,
    state: pull.state,
  };
}

function answerTree(state: StubState, body: unknown): Response {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the adapter under test sends it
  const request = body as {
    base_tree: string;
    tree: { path: string; content?: string; sha?: string | null }[];
  };

  const files = new Map(state.trees.get(request.base_tree));

  for (const entry of request.tree) {
    if (entry.content === undefined) {
      files.delete(entry.path);
    } else {
      files.set(entry.path, entry.content);
    }
  }

  const sha = state.nextSHA();

  state.trees.set(sha, files);

  return Response.json({ sha }, { status: 201 });
}

function answerCommit(state: StubState, body: unknown): Response {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the adapter under test sends it
  const request = body as { tree: string; parents: string[] };
  const sha = state.nextSHA();

  state.commits.set(sha, { tree: request.tree, parents: request.parents });

  return Response.json({ sha }, { status: 201 });
}

function answerNewRef(state: StubState, body: unknown): Response {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the adapter under test sends it
  const request = body as { ref: string; sha: string };
  const branch = request.ref.replace(/^refs\/heads\//u, '');

  if (state.refs.has(branch)) {
    return Response.json({ message: 'Reference already exists' }, { status: 422 });
  }

  state.refs.set(branch, request.sha);

  return Response.json({ ref: request.ref, object: { sha: request.sha } }, { status: 201 });
}

function answerPullList(state: StubState, query: URLSearchParams): Response {
  const [, head] = (query.get('head') ?? '').split(':');

  const open = state.pulls.filter(
    (pull) =>
      pull.state === query.get('state') &&
      pull.head === head &&
      pull.base === (query.get('base') ?? pull.base),
  );

  return Response.json(open.map((pull) => toPullJSON(state, pull)));
}

function answerNewPull(state: StubState, body: unknown): Response {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the adapter under test sends it
  const request = body as { title: string; body: string; head: string; base: string };

  if (state.pulls.some((pull) => pull.head === request.head && pull.state === 'open')) {
    return Response.json({ message: 'A pull request already exists' }, { status: 422 });
  }

  const pull: StubGitHubPull = { number: state.pulls.length + 1, state: 'open', ...request };

  state.pulls.push(pull);

  return Response.json(toPullJSON(state, pull), { status: 201 });
}
