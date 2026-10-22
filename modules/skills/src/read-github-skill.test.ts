import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitHubSkill } from './read-github-skill';
import { createStubGitHubRepo } from './test-utils/create-stub-github-repo';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-github-skill-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test("it reads each file of the skill's folder at the commit and leaves out dot paths", async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: {
      'skills/tides/SKILL.md': '# Tides\n',
      'skills/tides/scripts/read.py': 'print(1)\n',
      'skills/tides/.github/notes.md': 'draft\n',
      'skills/other/SKILL.md': '# Other\n',
    },
  });

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'skills/tides',
      commit: repo.commit,
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toStrictEqual({
    status: 'ok',
    skill: {
      files: [
        { path: 'SKILL.md', text: '# Tides\n' },
        { path: 'scripts/read.py', text: 'print(1)\n' },
      ],
      skipped: ['.github/notes.md'],
      signature: { status: 'unsigned' },
    },
  });
});

test.each([
  ['verified', { verified: true, reason: 'valid' }, { status: 'verified' }],
  [
    'unverified',
    { verified: false, reason: 'unknown_key' },
    { status: 'unverified', reason: 'unknown_key' },
  ],
])('it reports a %s publisher signature', async (_label, verification, signature) => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/SKILL.md': '# Tides\n' },
    verification,
  });

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides',
      commit: repo.commit,
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toMatchObject({ status: 'ok', skill: { signature } });
});

test('it refuses a commit the repository lacks', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/SKILL.md': '# Tides\n' },
  });

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides',
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toStrictEqual({
    status: 'refused',
    reason:
      'https://github.com/example/skills has no commit 3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
  });
});

test('it refuses a path that names no folder at the commit', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/SKILL.md': '# Tides\n' },
  });

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides/SKILL.md',
      commit: repo.commit,
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toStrictEqual({
    status: 'refused',
    reason: `tides/SKILL.md is not a folder at commit ${repo.commit}`,
  });
});

test('it refuses a folder that holds a symlink', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/SKILL.md': '# Tides\n' },
  });

  await $`ln -s /etc/hostname tides/host && git add -A && git -c user.name=Publisher -c user.email=publisher@example.test commit -q -m link`
    .cwd(ctx.directory)
    .env(repo.gitEnv)
    .quiet();

  const head = await $`git rev-parse HEAD`.cwd(ctx.directory).env(repo.gitEnv).text();

  const commit = head.trim();

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides',
      commit,
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toStrictEqual({
    status: 'refused',
    reason: 'host is a symlink or a submodule, which a skill cannot hold',
  });
});

test('it refuses a file past the size limit before it reads the file', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/SKILL.md': '# Tides\n', 'tides/table.csv': 'x'.repeat(2048) },
  });

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides',
      commit: repo.commit,
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toStrictEqual({
    status: 'refused',
    reason: 'table.csv is past the 1024-byte limit for a skill file',
  });
});

test('it refuses files past the total size limit', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/a.md': 'x'.repeat(900), 'tides/b.md': 'x'.repeat(900) },
  });

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides',
      commit: repo.commit,
    },
    { maxFileBytes: 1024, maxTotalBytes: 1500 },
  );

  expect(read).toStrictEqual({
    status: 'refused',
    reason: "the skill's files are past the 1500-byte limit in all",
  });
});

test('it refuses a file whose fetched text differs from the bytes at the commit', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/SKILL.md': new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x0a]) },
  });

  const read = await readGitHubSkill(
    repo.readPage,
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides',
      commit: repo.commit,
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toStrictEqual({
    status: 'refused',
    reason:
      'the text nixie read for SKILL.md differs from the file at the commit, so the file is not plain UTF-8 text',
  });
});

test('it refuses when the fetcher fails', async () => {
  const read = await readGitHubSkill(
    () =>
      Promise.resolve({
        kind: 'refused',
        reason: 'api.github.com resolves to 10.0.0.7, which is not a public address',
      }),
    {
      owner: 'example',
      name: 'skills',
      repository: 'https://github.com/example/skills',
      path: 'tides',
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    },
    { maxFileBytes: 1024, maxTotalBytes: 4096 },
  );

  expect(read).toStrictEqual({
    status: 'refused',
    reason:
      'https://api.github.com/repos/example/skills/git/commits/3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52: api.github.com resolves to 10.0.0.7, which is not a public address',
  });
});
