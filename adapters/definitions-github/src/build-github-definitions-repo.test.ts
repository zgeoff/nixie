import './mocks/run-github-mock';
import { expect, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { buildGitHubDefinitionsRepo } from './build-github-definitions-repo';
import { createMockGitHubRepo } from './mocks/create-mock-github-repo';
import { githubAPIURL } from './mocks/github-api-url';
import { githubStore } from './mocks/github-store';
import { server } from './mocks/node';
import { readMockFiles } from './mocks/read-mock-files';
import { writeMockBranchFile } from './mocks/write-mock-branch-file';

test("it reads the base branch's newest commit as the base revision", async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const first = await repo.readBaseRevision();

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'persona.md',
    text: '# Persona\n',
  });

  const second = await repo.readBaseRevision();

  expect(first).toBeString();
  expect(second).not.toBe(first);
});

test('it reads a file at a revision, and null for a missing one', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/skills.lock.json',
    text: '{}\n',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();
  const found = await repo.readFile('skills/skills.lock.json', revision);
  const missing = await repo.readFile('nixie.yaml', revision);

  expect(found).toBe('{}\n');
  expect(missing).toBeNull();
});

test('it reads a file at the pinned revision after the base branch moves', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/skills.lock.json',
    text: '{}\n',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/skills.lock.json',
    text: '{"star-chart":{}}\n',
  });

  const pinned = await repo.readFile('skills/skills.lock.json', revision);

  expect(pinned).toBe('{}\n');
});

test('it lists the files under a folder at a revision, nested ones included', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/tide-tables/SKILL.md',
    text: '# Tides\n',
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/tide-tables/scripts/read.ts',
    text: '\n',
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/star-chart/SKILL.md',
    text: '# Stars\n',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();
  const listed = await repo.readFolder('skills/tide-tables', revision);

  expect(listed).toIncludeSameMembers(['SKILL.md', 'scripts/read.ts']);
});

test('it reads the byte size of every file at the base revision', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/tide-tables/SKILL.md',
    text: '# Tides ✓\n',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();
  const sizes = await repo.readFileSizes(revision);

  expect(sizes).toStrictEqual(
    new Map([
      ['nixie.yaml', 10],
      ['skills/tide-tables/SKILL.md', 12],
    ]),
  );
});

test('it refuses a size listing that GitHub cut short', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  await githubStore.repos.update((query) => query.where({ repository: 'harbour/definitions' }), {
    data(draft) {
      draft.isTruncated = true;
    },
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();

  expect(repo.readFileSizes(revision)).rejects.toThrow(
    `the tree of ${revision} is too large to read whole`,
  );
});

test('it refuses a folder listing that GitHub cut short', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/tide-tables/SKILL.md',
    text: '# Tides\n',
  });

  await githubStore.repos.update((query) => query.where({ repository: 'harbour/definitions' }), {
    data(draft) {
      draft.isTruncated = true;
    },
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();

  expect(repo.readFolder('skills/tide-tables', revision)).rejects.toThrow(
    `the tree of ${revision} is too large to read whole`,
  );
});

test('it opens a pull request from a branch that holds the change on the pinned revision', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 2\n',
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'skills/tide-tables/old.md',
    text: '# Old\n',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'persona.md',
    text: '# Persona\n',
  });

  const pullRequest = await repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Update the tide-tables skill to the version nixie wrote',
      message: 'Update the tide-tables skill to the version nixie wrote\n\nMerge it.\n',
      body: 'Merge it.\n',
      files: new Map([
        ['skills/tide-tables/SKILL.md', '# Tides\n'],
        ['skills/tide-tables/old.md', null],
      ]),
    },
    revision,
  );

  expect(pullRequest).toStrictEqual({
    number: 1,
    url: 'https://github.test/harbour/definitions/pull/1',
  });

  expect(readMockFiles('harbour/definitions', 'nixie/skill/tide-tables')).toStrictEqual({
    'nixie.yaml': 'format: 2\n',
    'skills/tide-tables/SKILL.md': '# Tides\n',
  });

  expect(githubStore.pulls.all()).toMatchObject([
    {
      repository: 'harbour/definitions',
      number: 1,
      head: 'nixie/skill/tide-tables',
      base: 'main',
      title: 'Update the tide-tables skill to the version nixie wrote',
      body: 'Merge it.\n',
      state: 'open',
    },
  ]);

  const head = githubStore.refs.findFirst((query) =>
    query.where({ repository: 'harbour/definitions', branch: 'nixie/skill/tide-tables' }),
  );

  invariant(head);

  expect(githubStore.commits.findFirst((query) => query.where({ sha: head.sha }))?.message).toBe(
    'Update the tide-tables skill to the version nixie wrote\n\nMerge it.\n',
  );
});

test('it rebuilds the branch on a later revision and updates the open pull request', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const first = await repo.readBaseRevision();

  await repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
      body: 'First.\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    first,
  );

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'persona.md',
    text: '# Persona\n',
  });

  const second = await repo.readBaseRevision();

  const pullRequest = await repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'skills: update tide-tables',
      message: 'skills: update tide-tables\n\nSecond.\n',
      body: 'Second.\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides by port\n']]),
    },
    second,
  );

  expect(pullRequest.number).toBe(1);

  expect(readMockFiles('harbour/definitions', 'nixie/skill/tide-tables')).toStrictEqual({
    'persona.md': '# Persona\n',
    'skills/tide-tables/SKILL.md': '# Tides by port\n',
  });

  expect(githubStore.pulls.all()).toMatchObject([
    { title: 'skills: update tide-tables', body: 'Second.\n' },
  ]);

  const head = githubStore.refs.findFirst((query) =>
    query.where({ repository: 'harbour/definitions', branch: 'nixie/skill/tide-tables' }),
  );

  invariant(head);

  expect(githubStore.commits.findFirst((query) => query.where({ sha: head.sha }))?.message).toBe(
    'skills: update tide-tables\n\nSecond.\n',
  );
});

test('it closes a pull request', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();

  await repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
      body: 'First.\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    revision,
  );

  await repo.closePullRequest(1);

  expect(githubStore.pulls.all()[0]?.state).toBe('closed');
});

test("it reads a branch's open pull request", async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();

  const opened = await repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
      body: 'First.\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    revision,
  );

  const found = await repo.readOpenPullRequest('nixie/skill/tide-tables');

  expect(found).toStrictEqual(opened);
});

test('it reads no open pull request for a branch whose pull request closed', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const revision = await repo.readBaseRevision();

  await repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      message: 'Add the tide-tables skill that nixie wrote',
      body: 'First.\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    revision,
  );

  await repo.closePullRequest(1);

  const found = await repo.readOpenPullRequest('nixie/skill/tide-tables');

  expect(found).toBeNull();
});

test.each([
  ['an answer of the wrong shape', '{}'],
  ['an answer that is not JSON', 'not json'],
])('it refuses %s with no status', async (_, answer) => {
  server.use(http.get(`${githubAPIURL}/*`, () => new HttpResponse(answer)));

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: githubAPIURL,
  });

  const refusal = await repo.readFile('nixie.yaml', 'main').then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toMatchObject({ name: 'GitHubRequestError', status: null });
});

test('it refuses a request GitHub refuses, with its status and never the token', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-b',
    apiURL: githubAPIURL,
  });

  const refusal = await repo.readBaseRevision().then(
    () => null,
    (error: unknown) => error,
  );

  invariant(refusal instanceof Error);

  expect(refusal).toMatchObject({ name: 'GitHubRequestError', status: 401 });
  expect(refusal.message).not.toInclude('token-b');
});
