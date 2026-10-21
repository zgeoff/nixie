import { faker } from '@faker-js/faker';
import { http } from 'msw';
import type { z } from 'zod';
import type { GitHubOperation } from '../github-contract';
import { githubContract } from '../github-contract';
import { findGitHubRoute } from './find-github-route';
import { githubAPIURL } from './github-api-url';
import { githubStore } from './github-store';
import { readMockFiles } from './read-mock-files';

// the repo a request names, the parameters of its route's path, its query and its body
interface MockCall {
  readonly repository: string;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

// GitHub's REST API over the mock store's repos, routed and parsed by the adapter's GitHub
// contract. As GitHub does, it answers a token no repo holds with 401, a refused body with 422,
// and a missing repo, branch, file or pull request with 404.
export const githubHandlers = [
  http.all(`${githubAPIURL}/*`, async (info) => {
    const request = info.request;

    const url = new URL(request.url);

    const route = findGitHubRoute(githubContract, request.method, url.pathname);

    const token = /^Bearer (?<token>\S+)$/u.exec(request.headers.get('authorization') ?? '')
      ?.groups?.['token'];

    if (token === undefined) {
      return Response.json({ message: 'Requires authentication' }, { status: 401 });
    }

    const repo = githubStore.repos.findFirst((query) =>
      query.where({ repository: `${route?.params['owner']}/${route?.params['name']}` }),
    );

    if (githubStore.repos.findFirst((query) => query.where({ token })) === undefined) {
      return Response.json({ message: 'Bad credentials' }, { status: 401 });
    }

    if (route === null || repo === undefined || repo.token !== token) {
      return notFound();
    }

    const body: unknown = request.method === 'GET' ? null : await request.json();

    const call: MockCall = {
      repository: repo.repository,
      params: route.params,
      query: url.searchParams,
      body,
    };

    const answers: Readonly<
      Record<keyof typeof githubContract, (routed: MockCall) => Promise<Response> | Response>
    > = {
      readRef: answerRefRead,
      updateRef: answerRefUpdate,
      createRef: answerNewRef,
      readContent: answerContent,
      readTree: answerTreeRead,
      createTree: answerTree,
      readCommit: answerCommitRead,
      createCommit: answerCommit,
      listPulls: answerPullList,
      createPull: answerNewPull,
      updatePull: answerPullUpdate,
    };

    return answers[route.name](call);
  }),
];

function notFound(): Response {
  return Response.json({ message: 'Not Found' }, { status: 404 });
}

function answerRefRead(call: MockCall): Response {
  const ref = githubStore.refs.findFirst((query) =>
    query.where({ repository: call.repository, branch: call.params['branch'] ?? '' }),
  );

  return ref === undefined
    ? notFound()
    : answerJSON(githubContract.readRef, { object: { sha: ref.sha } });
}

// an answer in the shape the contract gives the operation's response
function answerJSON<Operation extends GitHubOperation>(
  _operation: Operation,
  json: z.input<Operation['response']>,
  status = 200,
): Response {
  return Response.json(json, { status });
}

async function answerRefUpdate(call: MockCall): Promise<Response> {
  const ref = githubStore.refs.findFirst((query) =>
    query.where({ repository: call.repository, branch: call.params['branch'] ?? '' }),
  );

  if (ref === undefined) {
    return Response.json({ message: 'Reference does not exist' }, { status: 422 });
  }

  const parsed = githubContract.updateRef.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const update = parsed.data;

  if (update.force !== true && !hasAncestor(update.sha, ref.sha)) {
    return Response.json({ message: 'Update is not a fast forward' }, { status: 422 });
  }

  await githubStore.refs.update(ref, {
    data(draft) {
      draft.sha = update.sha;
    },
  });

  return answerJSON(githubContract.updateRef, { object: { sha: update.sha } });
}

// GitHub refuses a body that lacks a field the route needs, or holds one of the wrong type
function invalidRequest(): Response {
  return Response.json({ message: 'Invalid request' }, { status: 422 });
}

// whether the commit is the ancestor or descends from it, which a fast-forward update needs
function hasAncestor(commit: string, ancestor: string): boolean {
  const pending = [commit];

  const seen = new Set<string>();

  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next === ancestor) {
      return true;
    }

    if (!seen.has(next)) {
      seen.add(next);

      const sha = next;
      const found = githubStore.commits.findFirst((query) => query.where({ sha }));

      pending.push(...(found?.parents ?? []));
    }
  }

  return false;
}

async function answerNewRef(call: MockCall): Promise<Response> {
  const parsed = githubContract.createRef.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;
  const branch = request.ref.replace(/^refs\/heads\//u, '');

  const existing = githubStore.refs.findFirst((query) =>
    query.where({ repository: call.repository, branch }),
  );

  if (existing !== undefined) {
    return Response.json({ message: 'Reference already exists' }, { status: 422 });
  }

  await githubStore.refs.create({ repository: call.repository, branch, sha: request.sha });

  return answerJSON(githubContract.createRef, { object: { sha: request.sha } }, 201);
}

function answerContent(call: MockCall): Response {
  const query = githubContract.readContent.query.safeParse(Object.fromEntries(call.query));
  const files = query.success ? readMockFiles(call.repository, query.data.ref) : null;
  const text = files?.[call.params['path'] ?? ''];

  return text === undefined
    ? notFound()
    : answerJSON(githubContract.readContent, {
        content: Buffer.from(text).toString('base64'),
        encoding: 'base64',
      });
}

// a recursive tree read lists each folder and each file under the commit or tree it names
function answerTreeRead(call: MockCall): Response {
  const sha = call.params['sha'] ?? '';
  const tree = githubStore.trees.findFirst((query) => query.where({ sha }));
  const files = tree?.files ?? readMockFiles(call.repository, sha);
  const query = githubContract.readTree.query.safeParse(Object.fromEntries(call.query));
  const repo = githubStore.repos.findFirst((found) => found.where({ repository: call.repository }));

  if (files === null || !query.success) {
    return notFound();
  }

  const paths = Object.keys(files);

  const folders = new Set(
    paths.flatMap((path) =>
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
      ...paths.map((path) => ({ path, type: 'blob' })),
    ],
    truncated: repo?.isTruncated ?? false,
  });
}

async function answerTree(call: MockCall): Promise<Response> {
  const parsed = githubContract.createTree.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;
  const base = githubStore.trees.findFirst((query) => query.where({ sha: request.base_tree }));
  const files: Record<string, string> = { ...base?.files };

  for (const entry of request.tree) {
    if ('content' in entry) {
      files[entry.path] = entry.content;
    } else {
      delete files[entry.path];
    }
  }

  const tree = await githubStore.trees.create({ sha: faker.git.commitSha(), files });

  return answerJSON(githubContract.createTree, { sha: tree.sha }, 201);
}

function answerCommitRead(call: MockCall): Response {
  const sha = call.params['sha'] ?? '';
  const found = githubStore.commits.findFirst((query) => query.where({ sha }));

  return found === undefined
    ? notFound()
    : answerJSON(githubContract.readCommit, { sha, tree: { sha: found.tree } });
}

async function answerCommit(call: MockCall): Promise<Response> {
  const parsed = githubContract.createCommit.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;

  const commit = await githubStore.commits.create({
    sha: faker.git.commitSha(),
    tree: request.tree,
    parents: request.parents,
  });

  return answerJSON(githubContract.createCommit, { sha: commit.sha }, 201);
}

function answerPullList(call: MockCall): Response {
  const query = githubContract.listPulls.query.safeParse(Object.fromEntries(call.query));

  if (!query.success) {
    return invalidRequest();
  }

  const [, head = ''] = query.data.head.split(':');

  const listed = githubStore.pulls.findMany((found) =>
    found.where({
      repository: call.repository,
      state: query.data.state,
      head,
      base: query.data.base,
    }),
  );

  return answerJSON(
    githubContract.listPulls,
    listed.map((pull) => toPullJSON(pull)),
  );
}

interface MockPull {
  readonly repository: string;
  readonly number: number;
}

function toPullJSON(pull: MockPull) {
  return {
    number: pull.number,
    html_url: `https://github.test/${pull.repository}/pull/${pull.number}`,
  };
}

async function answerNewPull(call: MockCall): Promise<Response> {
  const parsed = githubContract.createPull.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const request = parsed.data;
  const pulls = githubStore.pulls.findMany((query) => query.where({ repository: call.repository }));

  if (pulls.some((pull) => pull.head === request.head && pull.state === 'open')) {
    return Response.json({ message: 'A pull request already exists' }, { status: 422 });
  }

  const pull = await githubStore.pulls.create({
    repository: call.repository,
    number: pulls.length + 1,
    state: 'open',
    ...request,
  });

  return answerJSON(githubContract.createPull, toPullJSON(pull), 201);
}

async function answerPullUpdate(call: MockCall): Promise<Response> {
  const pullNumber = Number(call.params['number']);

  const found = githubStore.pulls.findFirst((query) =>
    query.where({ repository: call.repository, number: pullNumber }),
  );

  if (found === undefined) {
    return notFound();
  }

  const parsed = githubContract.updatePull.request.safeParse(call.body);

  if (!parsed.success) {
    return invalidRequest();
  }

  const update = parsed.data;

  const pull = await githubStore.pulls.update(found, {
    data(draft) {
      draft.title = update.title ?? draft.title;
      draft.body = update.body ?? draft.body;
      draft.state = update.state ?? draft.state;
    },
  });

  return answerJSON(githubContract.updatePull, toPullJSON(pull ?? found));
}
