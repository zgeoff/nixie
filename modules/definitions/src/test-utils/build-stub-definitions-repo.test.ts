import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubDefinitionsRepo } from './build-stub-definitions-repo';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-stub-repo-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, repo: buildStubDefinitionsRepo(directory) };
}

test('it reads a file at the base revision, and null for a missing one', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'nixie.yaml'), 'format: 2\n');

  const revision = await ctx.repo.readBaseRevision();
  const found = await ctx.repo.readFile('nixie.yaml', revision);
  const missing = await ctx.repo.readFile('persona.md', revision);

  expect(found).toBe('format: 2\n');
  expect(missing).toBeNull();
});

test('it lists the files under a folder at the base revision, nested ones included', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'skills', 'tide-tables', 'scripts'), { recursive: true });
  await writeFile(join(ctx.directory, 'skills', 'tide-tables', 'SKILL.md'), '# Tides\n');
  await writeFile(join(ctx.directory, 'skills', 'tide-tables', 'scripts', 'read.ts'), '\n');

  const revision = await ctx.repo.readBaseRevision();
  const listed = await ctx.repo.readFolder('skills/tide-tables', revision);

  expect(listed).toStrictEqual(['SKILL.md', 'scripts/read.ts']);
});

test('it lists no files under a folder the base revision lacks', async () => {
  const ctx = await setupTest();
  const revision = await ctx.repo.readBaseRevision();
  const listed = await ctx.repo.readFolder('skills/tide-tables', revision);

  expect(listed).toStrictEqual([]);
});

test('it moves the base revision when a file changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'nixie.yaml'), 'format: 2\n');

  const before = await ctx.repo.readBaseRevision();

  await writeFile(join(ctx.directory, 'nixie.yaml'), 'format: 2\nskills: []\n');

  const after = await ctx.repo.readBaseRevision();

  expect(after).not.toBe(before);
});

test('it keeps the base revision while no file changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'nixie.yaml'), 'format: 2\n');

  const first = await ctx.repo.readBaseRevision();
  const second = await ctx.repo.readBaseRevision();

  expect(second).toBe(first);
});

test('it refuses a read at a revision the base moved past', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'nixie.yaml'), 'format: 2\n');

  const revision = await ctx.repo.readBaseRevision();

  await writeFile(join(ctx.directory, 'persona.md'), '# Persona\n');

  expect(ctx.repo.readFile('nixie.yaml', revision)).rejects.toThrow(
    `the stub holds only the newest base revision, not ${revision}`,
  );
});

test('it opens one pull request per branch, and a later change replaces its change and revision', async () => {
  const ctx = await setupTest();

  const first = await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      body: 'first\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    'revision-a',
  );

  const second = await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      body: 'second\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides by port\n']]),
    },
    'revision-b',
  );

  expect(first).toStrictEqual({ number: 1, url: 'https://definitions.test/pull/1' });
  expect(second).toStrictEqual(first);

  expect(ctx.repo.readPullRequests()).toStrictEqual([
    {
      number: 1,
      url: 'https://definitions.test/pull/1',
      state: 'open',
      revision: 'revision-b',
      change: {
        branch: 'nixie/skill/tide-tables',
        title: 'Add the tide-tables skill that nixie wrote',
        body: 'second\n',
        files: new Map([['skills/tide-tables/SKILL.md', '# Tides by port\n']]),
      },
    },
  ]);
});

test('it opens a new pull request on a branch whose pull request closed', async () => {
  const ctx = await setupTest();

  const change = {
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: 'first\n',
    files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
  };

  await ctx.repo.writePullRequest(change, 'revision-a');
  await ctx.repo.closePullRequest(1);

  const reopened = await ctx.repo.writePullRequest(change, 'revision-a');

  expect(reopened).toStrictEqual({ number: 2, url: 'https://definitions.test/pull/2' });

  expect(ctx.repo.readPullRequests().map((request) => request.state)).toStrictEqual([
    'closed',
    'open',
  ]);
});

test('it writes a merged change into the base branch, removing each file it removes', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.directory, 'skills', 'tide-tables', 'old.md'), '# Old\n');

  await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Update the tide-tables skill to the version nixie wrote',
      body: 'body\n',
      files: new Map([
        ['skills/tide-tables/SKILL.md', '# Tides\n'],
        ['skills/tide-tables/old.md', null],
      ]),
    },
    'revision-a',
  );

  await ctx.repo.mergePullRequest(1);

  const folder = await readdir(join(ctx.directory, 'skills', 'tide-tables'));
  const revision = await ctx.repo.readBaseRevision();
  const text = await ctx.repo.readFile('skills/tide-tables/SKILL.md', revision);

  expect(folder).toStrictEqual(['SKILL.md']);
  expect(text).toBe('# Tides\n');
  expect(ctx.repo.readPullRequests()[0]?.state).toBe('merged');
});

test("it reads a branch's open pull request, and null once it closes", async () => {
  const ctx = await setupTest();

  await ctx.repo.writePullRequest(
    {
      branch: 'nixie/skill/tide-tables',
      title: 'Add the tide-tables skill that nixie wrote',
      body: 'first\n',
      files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
    },
    'revision-a',
  );

  const open = await ctx.repo.readOpenPullRequest('nixie/skill/tide-tables');

  await ctx.repo.closePullRequest(1);

  const closed = await ctx.repo.readOpenPullRequest('nixie/skill/tide-tables');

  expect(open).toStrictEqual({ number: 1, url: 'https://definitions.test/pull/1' });
  expect(closed).toBeNull();
});

test('it opens the pull request and rejects the write when its answer is lost, and answers the next write', async () => {
  const ctx = await setupTest();

  const change = {
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: 'first\n',
    files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
  };

  ctx.repo.loseNextAnswer();

  const lost = await ctx.repo.writePullRequest(change, 'revision-a').then(
    () => null,
    (error: unknown) => error,
  );

  const next = await ctx.repo.writePullRequest(change, 'revision-b');

  expect(lost).toStrictEqual(new Error('the answer to the pull request write was lost'));
  expect(next).toStrictEqual({ number: 1, url: 'https://definitions.test/pull/1' });
  expect(ctx.repo.readPullRequests().map((request) => request.number)).toStrictEqual([1]);
});

test('it refuses to close a pull request it never opened', () => {
  const directory = join(tmpdir(), 'nixie-stub-repo-unused');

  expect(() => buildStubDefinitionsRepo(directory).closePullRequest(4)).toThrowWithMessage(
    Error,
    'no pull request is numbered 4',
  );
});
