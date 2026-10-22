import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { createStubGitHubRepo } from './create-stub-github-repo';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-stub-github-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it answers a commit with its tree and an unsigned verification', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'README.md': '# Skills\n' },
  });

  const tree = await $`git rev-parse HEAD^{tree}`.cwd(ctx.directory).env(repo.gitEnv).text();

  const reply = await repo.readPage(
    `https://api.github.com/repos/example/skills/git/commits/${repo.commit}`,
  );

  invariant(reply.kind === 'page' && reply.text !== null);

  expect(JSON.parse(reply.text)).toStrictEqual({
    sha: repo.commit,
    tree: { sha: tree.trim() },
    verification: { verified: false, reason: 'unsigned', signature: null, payload: null },
  });
});

test('it answers the verification the options give', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'README.md': '# Skills\n' },
    verification: { verified: true, reason: 'valid' },
  });

  const reply = await repo.readPage(
    `https://api.github.com/repos/example/skills/git/commits/${repo.commit}`,
  );

  invariant(reply.kind === 'page' && reply.text !== null);

  expect(JSON.parse(reply.text)).toMatchObject({
    verification: { verified: true, reason: 'valid' },
  });
});

test('it answers 422 for a commit the repository lacks', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'README.md': '# Skills\n' },
  });

  const reply = await repo.readPage(
    'https://api.github.com/repos/example/skills/git/commits/0000000000000000000000000000000000000000',
  );

  expect(reply).toMatchObject({ kind: 'page', status: 422 });
});

test("it lists a folder's entries with git's hashes and sizes", async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/SKILL.md': 'tide\n', 'tides/scripts/read.py': 'print(1)\n' },
  });

  const hashes =
    await $`git rev-parse HEAD:tides HEAD:tides/SKILL.md HEAD:tides/scripts HEAD:tides/scripts/read.py`
      .cwd(ctx.directory)
      .env(repo.gitEnv)
      .text();

  const [tree, skill, scripts, script] = hashes.trim().split('\n');

  invariant(tree !== undefined && skill !== undefined);
  invariant(scripts !== undefined && script !== undefined);

  const reply = await repo.readPage(
    `https://api.github.com/repos/example/skills/git/trees/${tree}?recursive=1`,
  );

  invariant(reply.kind === 'page' && reply.text !== null);

  expect(JSON.parse(reply.text)).toStrictEqual({
    sha: tree,
    tree: [
      { path: 'SKILL.md', mode: '100644', type: 'blob', sha: skill, size: 5 },
      { path: 'scripts', mode: '040000', type: 'tree', sha: scripts },
      { path: 'scripts/read.py', mode: '100644', type: 'blob', sha: script, size: 9 },
    ],
    truncated: false,
  });
});

test('it serves the text of a file at the commit as plain text', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'tides/my notes.md': 'High tide at noon.\n' },
  });

  const reply = await repo.readPage(
    `https://raw.githubusercontent.com/example/skills/${repo.commit}/tides/my%20notes.md`,
  );

  expect(reply).toMatchObject({
    kind: 'page',
    status: 200,
    contentType: 'text/plain; charset=utf-8',
    text: 'High tide at noon.\n',
  });
});

test('it answers 404 for a URL of another repository', async () => {
  const ctx = await setupTest();

  const repo = await createStubGitHubRepo(ctx.directory, {
    owner: 'example',
    name: 'skills',
    files: { 'README.md': '# Skills\n' },
  });

  const reply = await repo.readPage(
    `https://api.github.com/repos/example/other/git/commits/${repo.commit}`,
  );

  expect(reply).toMatchObject({ kind: 'page', status: 404 });
});
