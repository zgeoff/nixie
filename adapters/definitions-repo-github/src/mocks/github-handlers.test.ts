import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createMockGitHubRepo } from './create-mock-github-repo';
import { githubAPIURL } from './github-api-url';
import { githubStore } from './github-store';
import { readMockFiles } from './read-mock-files';
import { writeMockBranchFile } from './write-mock-branch-file';

test('it answers a request with the token of the repo it names', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/git/ref/heads/main`, {
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
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/git/ref/heads/main`, {
    headers,
  });

  expect(response.status).toBe(401);
});

test("it answers a request with another repo's token with 404", async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });
  await createMockGitHubRepo({ repository: 'harbour/other', base: 'main', token: 'token-b' });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/git/ref/heads/main`, {
    headers: { authorization: 'Bearer token-b' },
  });

  expect(response.status).toBe(404);
});

test('it serves a file on the base branch as base64, and 404 for a missing one', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const found = await fetch(
    `${githubAPIURL}/repos/harbour/definitions/contents/nixie.yaml?ref=main`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const missing = await fetch(
    `${githubAPIURL}/repos/harbour/definitions/contents/persona.md?ref=main`,
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
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const pinned = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));

  invariant(pinned);

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\nskills: []\n',
  });

  const found = await fetch(
    `${githubAPIURL}/repos/harbour/definitions/contents/nixie.yaml?ref=${pinned.sha}`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const file: unknown = await found.json();

  expect(file).toStrictEqual({
    content: Buffer.from('format: 2\n').toString('base64'),
    encoding: 'base64',
  });
});

test("it lists a commit's tree recursively, each folder and each file with its byte size", async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/tide-tables/SKILL.md',
    text: '# Tides\n',
  });

  const response = await fetch(
    `${githubAPIURL}/repos/harbour/definitions/git/trees/main?recursive=1`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const tree: unknown = await response.json();

  expect(tree).toStrictEqual({
    sha: 'main',
    tree: [
      { path: 'skills', type: 'tree' },
      { path: 'skills/tide-tables', type: 'tree' },
      { path: 'skills/tide-tables/SKILL.md', type: 'blob', size: 8 },
    ],
    truncated: false,
  });
});

test('it marks a recursive tree read cut short for a repo that cuts them', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await githubStore.repos.update((query) => query.where({ repository: 'harbour/definitions' }), {
    data(draft) {
      draft.isTruncated = true;
    },
  });

  const response = await fetch(
    `${githubAPIURL}/repos/harbour/definitions/git/trees/main?recursive=1`,
    { headers: { authorization: 'Bearer token-a' } },
  );

  const tree: unknown = await response.json();

  expect(tree).toMatchObject({ truncated: true });
});

test('it builds a tree on a base tree, writing and removing files, and a commit a new branch points at', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/tide-tables/old.md',
    text: '# Old\n',
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const headers = { authorization: 'Bearer token-a' };
  const repo = `${githubAPIURL}/repos/harbour/definitions`;
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

  expect(readMockFiles('harbour/definitions', 'nixie/skill/tide-tables')).toStrictEqual({
    'nixie.yaml': 'format: 2\n',
    'skills/tide-tables/SKILL.md': '# Tides\n',
  });
});

test('it refuses an update that is not a fast forward without force with 422, and keeps the branch', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const first = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));

  invariant(first);

  const older = first.sha;

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ sha: older }),
  });

  expect(response.status).toBe(422);

  expect(readMockFiles('harbour/definitions', 'main')).toStrictEqual({
    'nixie.yaml': 'format: 2\n',
  });
});

test('it moves a branch back to an older commit on a forced update', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const first = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));

  invariant(first);

  const older = first.sha;

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ sha: older, force: true }),
  });

  expect(response.status).toBe(200);
  expect(readMockFiles('harbour/definitions', 'main')).toStrictEqual({});
});

test('it moves a branch forward to a commit that descends from its head without force', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const first = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));

  invariant(first);

  await githubStore.refs.create({
    repository: 'harbour/definitions',
    branch: 'side',
    sha: first.sha,
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const head = githubStore.refs.findFirst((query) => query.where({ branch: 'main' }));

  invariant(head);

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/git/refs/heads/side`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ sha: head.sha }),
  });

  expect(response.status).toBe(200);

  expect(readMockFiles('harbour/definitions', 'side')).toStrictEqual({
    'nixie.yaml': 'format: 2\n',
  });
});

test('it refuses to update a branch that is missing with 422', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const response = await fetch(
    `${githubAPIURL}/repos/harbour/definitions/git/refs/heads/nixie/skill/tide-tables`,
    {
      method: 'PATCH',
      headers: { authorization: 'Bearer token-a' },
      body: JSON.stringify({ sha: 'abc', force: true }),
    },
  );

  expect(response.status).toBe(422);
});

test('it lists the open pull request from a head, and closes it on an update', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const headers = { authorization: 'Bearer token-a' };
  const repo = `${githubAPIURL}/repos/harbour/definitions`;

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

  const listed: unknown = await fetch(
    `${repo}/pulls?state=open&head=harbour%3Anixie%2Fskill%2Ftide-tables&base=main`,
    { headers },
  ).then((response) => response.json());

  await fetch(`${repo}/pulls/1`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ state: 'closed' }),
  });

  expect(listed).toStrictEqual([
    { number: 1, html_url: 'https://github.test/harbour/definitions/pull/1' },
  ]);

  expect(githubStore.pulls.all()).toMatchObject([
    {
      repository: 'harbour/definitions',
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
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const headers = { authorization: 'Bearer token-a' };

  const pull = JSON.stringify({
    title: 'Add tides',
    body: 'body\n',
    head: 'nixie/skill/tide-tables',
    base: 'main',
  });

  await fetch(`${githubAPIURL}/repos/harbour/definitions/pulls`, {
    method: 'POST',
    headers,
    body: pull,
  });

  const second = await fetch(`${githubAPIURL}/repos/harbour/definitions/pulls`, {
    method: 'POST',
    headers,
    body: pull,
  });

  expect(second.status).toBe(422);
});

test('it refuses a pull request update to a state GitHub lacks with 422', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await githubStore.pulls.create({
    repository: 'harbour/definitions',
    number: 1,
    head: 'nixie/skill/tide-tables',
    state: 'open',
  });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/pulls/1`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ state: 'merged' }),
  });

  expect(response.status).toBe(422);
  expect(githubStore.pulls.all()[0]?.state).toBe('open');
});

test.each([
  ['git/trees', { tree: [] }],
  ['git/trees', { base_tree: 'abc', tree: [{ path: 'nixie.yaml' }] }],
  ['git/commits', { message: 'Add tides', tree: 'abc' }],
  ['git/refs', { ref: 'heads/side', sha: 'abc' }],
  ['pulls', { title: 'Add the tide-tables skill that nixie wrote', head: 'side', base: 'main' }],
])('it refuses POST %s with a body that lacks a field with 422', async (route, body) => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/${route}`, {
    method: 'POST',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(422);
});

test('it refuses PATCH git/refs/heads/main with a body that lacks the sha with 422', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer token-a' },
    body: JSON.stringify({ force: true }),
  });

  expect(response.status).toBe(422);
});

test('it answers a route the contract lacks with 404', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const response = await fetch(`${githubAPIURL}/repos/harbour/definitions/issues`, {
    headers: { authorization: 'Bearer token-a' },
  });

  expect(response.status).toBe(404);
});
