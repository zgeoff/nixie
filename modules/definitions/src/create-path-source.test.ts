import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContentHash } from './build-content-hash';
import { createPathSource } from './create-path-source';
import { createStubGitSyncWorktree } from './test-utils/create-stub-git-sync-worktree';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-definitions-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(root);

  return { directory, root };
}

test('it reads each definitions file under the root with its path relative to the root', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'jobs'));
  await writeFile(join(ctx.root, 'jobs', 'morning.yaml'), 'id: morning\n');

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();

  const job = new TextEncoder().encode('id: morning\n');
  const persona = new TextEncoder().encode('# Persona\n');

  const files = new Map([
    ['jobs/morning.yaml', job],
    ['persona.md', persona],
  ]);

  expect(snapshot).toStrictEqual({
    contentHash: buildContentHash(files),
    files,
    revision: buildContentHash(files),
    repository: null,
    skipped: [],
  });
});

test('it gives CRLF files the content hash of the same files with LF', async () => {
  const ctx = await setupTest();

  const crlf = join(ctx.directory, 'crlf');

  await mkdir(crlf);
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nWarm.\n');
  await writeFile(join(crlf, 'persona.md'), '# Persona\r\n\r\nWarm.\r\n');

  const fromLF = await createPathSource({ directory: ctx.root }).snapshot();
  const fromCRLF = await createPathSource({ directory: crlf }).snapshot();

  expect(fromCRLF.contentHash).toBe(fromLF.contentHash);
  expect(new TextDecoder().decode(fromCRLF.files.get('persona.md'))).toBe('# Persona\n\nWarm.\n');
});

test('it skips every path with a part that starts with a dot', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, '.persona.md'), '# Draft\n');
  await mkdir(join(ctx.root, '.git'));
  await writeFile(join(ctx.root, '.git', 'config.json'), '{}');
  await mkdir(join(ctx.root, 'jobs'));
  await writeFile(join(ctx.root, 'jobs', '.draft.yaml'), 'id: draft\n');

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['persona.md']);
  expect(snapshot.skipped).toStrictEqual(['.git', '.persona.md', 'jobs/.draft.yaml']);
});

test('it skips every root entry outside the known definitions paths by name', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'README.txt'), 'not a definition\n');
  await mkdir(join(ctx.root, 'scripts'));
  await writeFile(join(ctx.root, 'scripts', 'seed.sh'), 'echo seed\n');
  await writeFile(join(ctx.root, 'rules.toml'), 'id = "rule"\n');

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['persona.md']);
  expect(snapshot.skipped).toStrictEqual(['README.txt', 'rules.toml', 'scripts']);
});

test('it skips a file without a definitions extension under rules', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'mail.yaml'), 'id: mail\n');
  await writeFile(join(ctx.root, 'rules', 'notes.txt'), 'draft\n');

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['rules/mail.yaml']);
  expect(snapshot.skipped).toStrictEqual(['rules/notes.txt']);
});

test('it gives definitions with docs and a broken file beside them the same content hash', async () => {
  const ctx = await setupTest();

  const plain = join(ctx.directory, 'plain');

  await Promise.all([
    Bun.write(join(plain, 'persona.md'), '# Persona\n'),
    Bun.write(join(ctx.root, 'persona.md'), '# Persona\n'),
    Bun.write(join(ctx.root, 'readme.md'), '# Definitions\n'),
    Bun.write(join(ctx.root, 'docs', 'readme.md'), '# Docs\n'),
    Bun.write(join(ctx.root, 'notes', 'bad.json'), '{ not json'),
  ]);

  await symlink(plain, join(ctx.root, 'docs', 'outside'));

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();
  const without = await createPathSource({ directory: plain }).snapshot();

  expect(snapshot.contentHash).toBe(without.contentHash);
  expect(snapshot.skipped).toStrictEqual(['docs', 'notes', 'readme.md']);
});

test('it names a misnamed definitions folder in the skipped list', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rule'));
  await writeFile(join(ctx.root, 'rule', 'mail.yaml'), 'id: mail\n');

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['persona.md']);
  expect(snapshot.skipped).toStrictEqual(['rule']);
});

test('it reads every file under skills, whatever its extension', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'pdf-forms', 'scripts'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'pdf-forms', 'SKILL.md'), '# PDF forms\n');
  await writeFile(join(ctx.root, 'skills', 'pdf-forms', 'scripts', 'fill.py'), 'print(1)\n');
  await writeFile(join(ctx.root, 'fill.py'), 'print(1)\n');

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual([
    'skills/pdf-forms/SKILL.md',
    'skills/pdf-forms/scripts/fill.py',
  ]);

  expect(snapshot.skipped).toStrictEqual(['fill.py']);
});

test('it fails the snapshot at a symlink that leads outside the root', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'secret.md'), 'outside\n');
  await mkdir(join(ctx.root, 'rules'));
  await symlink(join(ctx.directory, 'secret.md'), join(ctx.root, 'rules', 'escape.md'));

  expect(createPathSource({ directory: ctx.root }).snapshot()).rejects.toMatchObject({
    name: 'SnapshotError',
    message: 'a symlink leads outside the definitions root: rules/escape.md',
    paths: ['rules/escape.md'],
  });
});

test('it fails the snapshot at a symlink whose target does not exist', async () => {
  const ctx = await setupTest();

  await symlink(join(ctx.root, 'missing.md'), join(ctx.root, 'persona.md'));

  expect(createPathSource({ directory: ctx.root }).snapshot()).rejects.toMatchObject({
    name: 'SnapshotError',
    paths: ['persona.md'],
  });
});

test('it skips a symlink that stays inside the root', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'mail.yaml'), 'id: mail\n');
  await symlink(join(ctx.root, 'rules', 'mail.yaml'), join(ctx.root, 'rules', 'alias.yaml'));

  const snapshot = await createPathSource({ directory: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['rules/mail.yaml']);
  expect(snapshot.skipped).toStrictEqual(['rules/alias.yaml']);
});

test('it fails the snapshot with every file past the per-file limit', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'a.md'), '12345678901');
  await writeFile(join(ctx.root, 'rules', 'b.md'), '1234567890');
  await writeFile(join(ctx.root, 'rules', 'c.md'), '123456789012');

  const source = createPathSource({
    directory: ctx.root,
    limits: { maxFileBytes: 10, maxTotalBytes: 1000 },
  });

  expect(source.snapshot()).rejects.toMatchObject({
    name: 'SnapshotError',
    message: 'files past the 10-byte limit: rules/a.md, rules/c.md',
    paths: ['rules/a.md', 'rules/c.md'],
  });
});

test('it fails the snapshot with the files past the total limit', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'a.md'), '1234567890');
  await writeFile(join(ctx.root, 'rules', 'b.md'), '1234567890');
  await writeFile(join(ctx.root, 'rules', 'c.md'), '1234567890');

  const source = createPathSource({
    directory: ctx.root,
    limits: { maxFileBytes: 10, maxTotalBytes: 15 },
  });

  expect(source.snapshot()).rejects.toMatchObject({
    name: 'SnapshotError',
    message: 'files past the 15-byte total limit: rules/b.md, rules/c.md',
    paths: ['rules/b.md', 'rules/c.md'],
  });
});

test('it counts only the files the filter keeps towards the total limit', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '1234567890');
  await writeFile(join(ctx.root, 'big.bin'), '12345678901234567890');

  const source = createPathSource({
    directory: ctx.root,
    limits: { maxFileBytes: 10, maxTotalBytes: 10 },
  });

  const snapshot = await source.snapshot();

  expect(snapshot.skipped).toStrictEqual(['big.bin']);
});

test('it probes with the content hash, which changes after an edit', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const source = createPathSource({ directory: ctx.root });

  const before = await source.probe();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona, edited\n');

  const after = await source.probe();

  const persona = new TextEncoder().encode('# Persona\n');

  expect(before).toBe(buildContentHash(new Map([['persona.md', persona]])));
  expect(after).not.toBe(before);
});

test('it takes the commit and the origin of a git-sync worktree as the revision and the repository', async () => {
  const ctx = await setupTest();

  const worktree = await createStubGitSyncWorktree(ctx.directory, {
    commit: '9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71',
    config:
      '[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://git.example.test/other/fork\n' +
      '[remote "origin"]\n\turl = https://git.example.test/kestrel-labs/wren-definitions\n',
  });

  await writeFile(join(worktree, 'persona.md'), '# Persona\n');

  const snapshot = await createPathSource({ directory: join(ctx.directory, 'current') }).snapshot();

  const files = new Map([['persona.md', new TextEncoder().encode('# Persona\n')]]);

  expect(snapshot).toStrictEqual({
    contentHash: buildContentHash(files),
    files,
    revision: '9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71',
    repository: 'https://git.example.test/kestrel-labs/wren-definitions',
    skipped: ['.git'],
  });
});

test('it leaves the credentials and the query out of the repository it names', async () => {
  const ctx = await setupTest();

  const worktree = await createStubGitSyncWorktree(ctx.directory, {
    commit: '9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71',
    config:
      '[remote "origin"]\n\turl = "https://sync-bot:pa55-word@git.example.test/kestrel-labs/wren-definitions?token=t0k3n"\n',
  });

  await writeFile(join(worktree, 'persona.md'), '# Persona\n');

  const snapshot = await createPathSource({ directory: join(ctx.directory, 'current') }).snapshot();

  expect(snapshot.repository).toBe('https://git.example.test/kestrel-labs/wren-definitions');
});

test('it keeps an scp-style origin as git wrote it', async () => {
  const ctx = await setupTest();

  const worktree = await createStubGitSyncWorktree(ctx.directory, {
    commit: '9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71',
    config: '[remote "origin"]\n\turl = git@git.example.test:kestrel-labs/wren-definitions.git\n',
  });

  await writeFile(join(worktree, 'persona.md'), '# Persona\n');

  const snapshot = await createPathSource({ directory: join(ctx.directory, 'current') }).snapshot();

  expect(snapshot.repository).toBe('git@git.example.test:kestrel-labs/wren-definitions.git');
});

test('it takes the commit with no repository from a worktree whose repo has no origin', async () => {
  const ctx = await setupTest();

  const worktree = await createStubGitSyncWorktree(ctx.directory, {
    commit: '9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71',
    config: '[core]\n\tbare = false\n',
  });

  await writeFile(join(worktree, 'persona.md'), '# Persona\n');

  const snapshot = await createPathSource({ directory: join(ctx.directory, 'current') }).snapshot();

  expect(snapshot.revision).toBe('9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71');
  expect(snapshot.repository).toBeNull();
});

test('it keeps the content hash as the revision of a worktree whose HEAD names a branch', async () => {
  const ctx = await setupTest();

  const worktree = await createStubGitSyncWorktree(ctx.directory, {
    commit: '9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71',
    config: '[remote "origin"]\n\turl = https://git.example.test/kestrel-labs/wren-definitions\n',
    head: 'ref: refs/heads/main',
  });

  await writeFile(join(worktree, 'persona.md'), '# Persona\n');

  const snapshot = await createPathSource({ directory: join(ctx.directory, 'current') }).snapshot();

  const files = new Map([['persona.md', new TextEncoder().encode('# Persona\n')]]);

  expect(snapshot.revision).toBe(buildContentHash(files));
  expect(snapshot.repository).toBeNull();
});

test('it probes with a token that changes when git-sync moves to a new commit over the same files', async () => {
  const ctx = await setupTest();

  const first = await createStubGitSyncWorktree(ctx.directory, {
    commit: '9d4e2b7a1c6f0e8d3b5a7c9e1f2d4b6a8c0e3f71',
    config: '[remote "origin"]\n\turl = https://git.example.test/kestrel-labs/wren-definitions\n',
  });

  await writeFile(join(first, 'persona.md'), '# Persona\n');

  const source = createPathSource({ directory: join(ctx.directory, 'current') });

  const before = await source.probe();

  const second = await createStubGitSyncWorktree(ctx.directory, {
    commit: '2f8a0c6e4b1d9f3a5c7e0b2d4f6a8c1e3b5d7f92',
    config: '[remote "origin"]\n\turl = https://git.example.test/kestrel-labs/wren-definitions\n',
  });

  await writeFile(join(second, 'persona.md'), '# Persona\n');

  const after = await source.probe();

  expect(after).not.toBe(before);
});

test('it names the source by its directory', async () => {
  const ctx = await setupTest();

  const source = createPathSource({ directory: ctx.root });

  expect(source.id).toBe(`path:${ctx.root}`);
  expect(source.kind).toBe('path');
});

test('it gives the same directory written with a trailing slash the same source ID', async () => {
  const ctx = await setupTest();

  const plain = createPathSource({ directory: ctx.root });
  const slashed = createPathSource({ directory: `${ctx.root}/` });

  expect(slashed.id).toBe(plain.id);
});
