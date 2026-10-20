import { expect, test } from 'bun:test';
import { z } from 'zod';
import { startStubGitHub } from './start-stub-github';

test('it answers a request with its token', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const response = await fetch(`${github.url}/repos/harbour/definitions/git/ref/heads/main`, {
    headers: { authorization: 'Bearer token-a' },
  });

  expect(response.status).toBe(200);
});

test.each([
  ['another token', { authorization: 'Bearer token-b' }],
  ['its token without the scheme', { authorization: 'token-a' }],
  ['its token under another scheme', { authorization: 'token token-a' }],
  ['a token that only starts with its token', { authorization: 'Bearer token-ab' }],
  ['an empty bearer token', { authorization: 'Bearer ' }],
  ['no authorization header', {}],
])('it answers a request with %s with 401', async (_, headers) => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const response = await fetch(`${github.url}/repos/harbour/definitions/git/ref/heads/main`, {
    headers,
  });

  expect(response.status).toBe(401);
});

test('it serves a file on the base branch as base64, and 404 for a missing one', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('nixie.yaml', 'format: 2\n');

  const found = await fetch(
    `${github.url}/repos/harbour/definitions/contents/nixie.yaml?ref=main`,
    {
      headers: { authorization: 'Bearer token-a' },
    },
  );

  const missing = await fetch(
    `${github.url}/repos/harbour/definitions/contents/persona.md?ref=main`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const file: unknown = await found.json();

  expect(file).toStrictEqual({
    content: Buffer.from('format: 2\n').toString('base64'),
    encoding: 'base64',
  });

  expect(missing.status).toBe(404);
});

test('it serves a file at a commit after the base branch moves past it', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('nixie.yaml', 'format: 2\n');

  const ref = await fetch(`${github.url}/repos/harbour/definitions/git/ref/heads/main`, {
    headers: { authorization: 'Bearer token-a' },
  });

  const refJSON: unknown = await ref.json();

  const pinned = z.object({ object: z.object({ sha: z.string() }) }).parse(refJSON);

  github.writeBaseFile('nixie.yaml', 'format: 2\nskills: []\n');

  const found = await fetch(
    `${github.url}/repos/harbour/definitions/contents/nixie.yaml?ref=${pinned.object.sha}`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const file: unknown = await found.json();

  expect(file).toStrictEqual({
    content: Buffer.from('format: 2\n').toString('base64'),
    encoding: 'base64',
  });
});

test("it lists a commit's tree recursively, each folder and each file", async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('skills/tide-tables/SKILL.md', '# Tides\n');

  const response = await fetch(
    `${github.url}/repos/harbour/definitions/git/trees/main?recursive=1`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const tree: unknown = await response.json();

  expect(tree).toStrictEqual({
    sha: 'main',
    tree: [
      { path: 'skills', type: 'tree' },
      { path: 'skills/tide-tables', type: 'tree' },
      { path: 'skills/tide-tables/SKILL.md', type: 'blob' },
    ],
    truncated: false,
  });
});

test('it marks a recursive tree cut short once told to', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.truncateTrees();

  const response = await fetch(
    `${github.url}/repos/harbour/definitions/git/trees/main?recursive=1`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const tree: unknown = await response.json();

  expect(tree).toMatchObject({ truncated: true });
});

test('it builds a tree on a base tree, writing and removing files, and a commit a new branch points at', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('skills/tide-tables/old.md', '# Old\n');
  github.writeBaseFile('nixie.yaml', 'format: 2\n');

  const headers = { authorization: 'Bearer token-a' };
  const repo = `${github.url}/repos/harbour/definitions`;
  const sha = z.object({ sha: z.string() });

  const refBody: unknown = await fetch(`${repo}/git/ref/heads/main`, { headers }).then((response) =>
    response.json(),
  );

  const ref = z.object({ object: sha }).parse(refBody);

  const parentBody: unknown = await fetch(`${repo}/git/commits/${ref.object.sha}`, {
    headers,
  }).then((response) => response.json());

  const parent = z.object({ tree: sha }).parse(parentBody);

  const treeBody: unknown = await fetch(`${repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: [
        { path: 'skills/tide-tables/SKILL.md', mode: '100644', type: 'blob', content: '# Tides\n' },
        { path: 'skills/tide-tables/old.md', mode: '100644', type: 'blob', sha: null },
      ],
    }),
  }).then((response) => response.json());

  const tree = sha.parse(treeBody);

  const commitBody: unknown = await fetch(`${repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: 'Add tides', tree: tree.sha, parents: [ref.object.sha] }),
  }).then((response) => response.json());

  const commit = sha.parse(commitBody);

  await fetch(`${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: 'refs/heads/nixie/skill/tide-tables', sha: commit.sha }),
  });

  expect(github.readBranchFiles('nixie/skill/tide-tables')).toStrictEqual(
    new Map([
      ['nixie.yaml', 'format: 2\n'],
      ['skills/tide-tables/SKILL.md', '# Tides\n'],
    ]),
  );
});

test('it refuses an update that is not a fast forward without force with 422, and keeps the branch', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('nixie.yaml', 'format: 2\n');

  const response = await fetch(`${github.url}/repos/harbour/definitions/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ sha: 'commit-0' }),
  });

  expect(response.status).toBe(422);
  expect(github.readBranchFiles('main')).toStrictEqual(new Map([['nixie.yaml', 'format: 2\n']]));
});

test('it moves a branch back to an older commit on a forced update', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('nixie.yaml', 'format: 2\n');

  const response = await fetch(`${github.url}/repos/harbour/definitions/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ sha: 'commit-0', force: true }),
  });

  expect(response.status).toBe(200);
  expect(github.readBranchFiles('main')).toStrictEqual(new Map());
});

test('it moves a branch forward to a commit that descends from its head without force', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  await fetch(`${github.url}/repos/harbour/definitions/git/refs`, {
    method: 'POST',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ ref: 'refs/heads/side', sha: 'commit-0' }),
  });

  github.writeBaseFile('nixie.yaml', 'format: 2\n');

  const ref = await fetch(`${github.url}/repos/harbour/definitions/git/ref/heads/main`, {
    headers: { authorization: 'Bearer token-a' },
  });

  const refJSON: unknown = await ref.json();

  const head = z.object({ object: z.object({ sha: z.string() }) }).parse(refJSON);

  const response = await fetch(`${github.url}/repos/harbour/definitions/git/refs/heads/side`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ sha: head.object.sha }),
  });

  expect(response.status).toBe(200);
  expect(github.readBranchFiles('side')).toStrictEqual(new Map([['nixie.yaml', 'format: 2\n']]));
});

test('it refuses to update a branch that is missing with 422', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const response = await fetch(
    `${github.url}/repos/harbour/definitions/git/refs/heads/nixie/skill/tide-tables`,
    {
      method: 'PATCH',
      headers: { authorization: 'Bearer token-a' },
      body: JSON.stringify({ sha: 'commit-0', force: true }),
    },
  );

  expect(response.status).toBe(422);
});

test('it lists the open pull request from a head, and closes it on an update', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const headers = { authorization: 'Bearer token-a' };
  const repo = `${github.url}/repos/harbour/definitions`;

  await fetch(`${repo}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Add tides',
      body: 'body\n',
      head: 'nixie/skill/tide-tables',
      base: 'main',
    }),
  });

  const listed = await fetch(
    `${repo}/pulls?state=open&head=harbour%3Anixie%2Fskill%2Ftide-tables&base=main`,
    { headers },
  ).then((response) => response.json());

  await fetch(`${repo}/pulls/1`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ state: 'closed' }),
  });

  expect(listed).toStrictEqual([
    { number: 1, html_url: 'https://github.test/harbour/definitions/pull/1', state: 'open' },
  ]);

  expect(github.readPulls()).toStrictEqual([
    {
      number: 1,
      head: 'nixie/skill/tide-tables',
      base: 'main',
      title: 'Add tides',
      body: 'body\n',
      state: 'closed',
    },
  ]);
});

test('it refuses a second open pull request from one head with 422', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const headers = { authorization: 'Bearer token-a' };

  const pull = JSON.stringify({
    title: 'Add tides',
    body: 'body\n',
    head: 'nixie/skill/tide-tables',
    base: 'main',
  });

  await fetch(`${github.url}/repos/harbour/definitions/pulls`, {
    method: 'POST',
    headers,
    body: pull,
  });

  const second = await fetch(`${github.url}/repos/harbour/definitions/pulls`, {
    method: 'POST',
    headers,
    body: pull,
  });

  expect(second.status).toBe(422);
});

test('it refuses a pull request update to a state GitHub lacks with 422', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  await fetch(`${github.url}/repos/harbour/definitions/pulls`, {
    method: 'POST',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({
      title: 'Add the tide-tables skill that nixie wrote',
      body: 'Merge it.\n',
      head: 'nixie/skill/tide-tables',
      base: 'main',
    }),
  });

  const response = await fetch(`${github.url}/repos/harbour/definitions/pulls/1`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ state: 'merged' }),
  });

  expect(response.status).toBe(422);
  expect(github.readPulls()[0]?.state).toBe('open');
});

test.each([
  ['git/trees', { tree: [] }],
  ['git/trees', { base_tree: 'tree-0', tree: [{ path: 'nixie.yaml' }] }],
])('it refuses POST %s with a body that lacks a field with 422', async (route, body) => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const response = await fetch(`${github.url}/repos/harbour/definitions/${route}`, {
    method: 'POST',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(422);
});

test.each([['git/refs/heads/main', { force: true }]])(
  'it refuses PATCH %s with a body that lacks a field with 422',
  async (route, body) => {
    const github = startStubGitHub({
      repository: 'harbour/definitions',
      base: 'main',
      token: 'token-a',
    });

    const response = await fetch(`${github.url}/repos/harbour/definitions/${route}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer token-a' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(422);
  },
);
