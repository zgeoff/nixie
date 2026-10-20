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

test('it reads a file on the base branch, and null for a missing one', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'nixie.yaml'), 'format: 2\n');

  const found = await ctx.repo.readFile('nixie.yaml');
  const missing = await ctx.repo.readFile('persona.md');

  expect(found).toBe('format: 2\n');
  expect(missing).toBeNull();
});

test('it opens one pull request per branch, and a later change replaces its change', async () => {
  const ctx = await setupTest();

  const first = await ctx.repo.writePullRequest({
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: 'first\n',
    files: new Map([['skills/tide-tables/SKILL.md', '# Tides\n']]),
  });

  const second = await ctx.repo.writePullRequest({
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: 'second\n',
    files: new Map([['skills/tide-tables/SKILL.md', '# Tides by port\n']]),
  });

  expect(first).toStrictEqual({ number: 1, url: 'https://definitions.test/pull/1' });
  expect(second).toStrictEqual(first);

  expect(ctx.repo.readPullRequests()).toStrictEqual([
    {
      number: 1,
      url: 'https://definitions.test/pull/1',
      state: 'open',
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

  await ctx.repo.writePullRequest(change);
  await ctx.repo.closePullRequest(1);

  const reopened = await ctx.repo.writePullRequest(change);

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

  await ctx.repo.writePullRequest({
    branch: 'nixie/skill/tide-tables',
    title: 'Update the tide-tables skill to the version nixie wrote',
    body: 'body\n',
    files: new Map([
      ['skills/tide-tables/SKILL.md', '# Tides\n'],
      ['skills/tide-tables/old.md', null],
    ]),
  });

  await ctx.repo.mergePullRequest(1);

  const folder = await readdir(join(ctx.directory, 'skills', 'tide-tables'));
  const text = await ctx.repo.readFile('skills/tide-tables/SKILL.md');

  expect(folder).toStrictEqual(['SKILL.md']);
  expect(text).toBe('# Tides\n');
  expect(ctx.repo.readPullRequests()[0]?.state).toBe('merged');
});

test('it refuses to close a pull request it never opened', () => {
  const directory = join(tmpdir(), 'nixie-stub-repo-unused');

  expect(() => buildStubDefinitionsRepo(directory).closePullRequest(4)).toThrowWithMessage(
    Error,
    'no pull request is numbered 4',
  );
});
