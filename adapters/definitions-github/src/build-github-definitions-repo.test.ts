import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildGitHubDefinitionsRepo } from './build-github-definitions-repo';
import { startStubGitHub } from './test-utils/start-stub-github';

test('it reads a file on the base branch, and null for a missing one', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('skills/skills.lock.json', '{}\n');

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: github.url,
  });

  const found = await repo.readFile('skills/skills.lock.json');
  const missing = await repo.readFile('nixie.yaml');

  expect(found).toBe('{}\n');
  expect(missing).toBeNull();
});

test("it opens a pull request from a branch that holds the change on the base branch's newest commit", async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  github.writeBaseFile('nixie.yaml', 'format: 2\n');
  github.writeBaseFile('skills/tide-tables/old.md', '# Old\n');

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: github.url,
  });

  const pullRequest = await repo.writePullRequest({
    branch: 'nixie/skill/tide-tables',
    title: 'Update the tide-tables skill to the version nixie wrote',
    body: 'Merge it.\n',
    files: new Map([
      ['skills/tide-tables/SKILL.md', '# Tides\n'],
      ['skills/tide-tables/old.md', null],
    ]),
  });

  expect(pullRequest).toStrictEqual({
    number: 1,
    url: 'https://github.test/harbour/definitions/pull/1',
  });

  expect(github.readBranchFiles('nixie/skill/tide-tables')).toStrictEqual(
    new Map([
      ['nixie.yaml', 'format: 2\n'],
      ['skills/tide-tables/SKILL.md', '# Tides\n'],
    ]),
  );

  expect(github.readPulls()).toStrictEqual([
    {
      number: 1,
      head: 'nixie/skill/tide-tables',
      base: 'main',
      title: 'Update the tide-tables skill to the version nixie wrote',
      body: 'Merge it.\n',
      state: 'open',
    },
  ]);
});

test('it rebuilds the branch on the moved base and updates the open pull request', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: github.url,
  });

  await repo.writePullRequest({
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: 'First.\n',
    files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
  });

  github.writeBaseFile('persona.md', '# Persona\n');

  const pullRequest = await repo.writePullRequest({
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: 'Second.\n',
    files: new Map([['skills/tide-tables/SKILL.md', '# Tides by port\n']]),
  });

  expect(pullRequest.number).toBe(1);

  expect(github.readBranchFiles('nixie/skill/tide-tables')).toStrictEqual(
    new Map([
      ['persona.md', '# Persona\n'],
      ['skills/tide-tables/SKILL.md', '# Tides by port\n'],
    ]),
  );

  expect(github.readPulls().map((pull) => pull.body)).toStrictEqual(['Second.\n']);
});

test('it closes a pull request', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
    apiURL: github.url,
  });

  await repo.writePullRequest({
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: 'First.\n',
    files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
  });

  await repo.closePullRequest(1);

  expect(github.readPulls()[0]?.state).toBe('closed');
});

test('it refuses a request GitHub refuses, with its status and never the token', async () => {
  const github = startStubGitHub({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-a',
  });

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'token-b',
    apiURL: github.url,
  });

  const refusal = await repo.readFile('nixie.yaml').then(
    () => null,
    (error: unknown) => error,
  );

  invariant(refusal instanceof Error);

  expect(refusal).toMatchObject({ name: 'GitHubRequestError', status: 401 });
  expect(refusal.message).not.toInclude('token-b');
});
