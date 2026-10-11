import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContentHash } from './build-content-hash';
import { createPathSource } from './create-path-source';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-definitions-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const root = join(dir, 'definitions');

  await mkdir(root);
  return { dir, root };
}

test('it reads each definitions file under the root with its path relative to the root', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'jobs'));
  await writeFile(join(ctx.root, 'jobs', 'morning.yaml'), 'id: morning\n');

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();

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
    skipped: [],
  });
});

test('it gives CRLF files the content hash of the same files with LF', async () => {
  const ctx = await setupTest();

  const crlf = join(ctx.dir, 'crlf');

  await mkdir(crlf);
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nWarm.\n');
  await writeFile(join(crlf, 'persona.md'), '# Persona\r\n\r\nWarm.\r\n');

  const fromLF = await createPathSource({ dir: ctx.root }).snapshot();
  const fromCRLF = await createPathSource({ dir: crlf }).snapshot();

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

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();

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

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['persona.md']);
  expect(snapshot.skipped).toStrictEqual(['README.txt', 'rules.toml', 'scripts']);
});

test('it skips a file without a definitions extension under rules', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'mail.yaml'), 'id: mail\n');
  await writeFile(join(ctx.root, 'rules', 'notes.txt'), 'draft\n');

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['rules/mail.yaml']);
  expect(snapshot.skipped).toStrictEqual(['rules/notes.txt']);
});

test('it gives definitions with docs and a broken file beside them the same content hash', async () => {
  const ctx = await setupTest();

  const plain = join(ctx.dir, 'plain');

  await mkdir(plain);
  await writeFile(join(plain, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeNonDefinitions(ctx.root, plain);

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();
  const without = await createPathSource({ dir: plain }).snapshot();

  expect(snapshot.contentHash).toBe(without.contentHash);
  expect(snapshot.skipped).toStrictEqual(['docs', 'notes', 'readme.md']);
});

test('it names a misnamed definitions folder in the skipped list', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rule'));
  await writeFile(join(ctx.root, 'rule', 'mail.yaml'), 'id: mail\n');

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual(['persona.md']);
  expect(snapshot.skipped).toStrictEqual(['rule']);
});

test('it reads every file under skills, whatever its extension', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'pdf-forms', 'scripts'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'pdf-forms', 'SKILL.md'), '# PDF forms\n');
  await writeFile(join(ctx.root, 'skills', 'pdf-forms', 'scripts', 'fill.py'), 'print(1)\n');
  await writeFile(join(ctx.root, 'fill.py'), 'print(1)\n');

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();

  expect([...snapshot.files.keys()]).toStrictEqual([
    'skills/pdf-forms/SKILL.md',
    'skills/pdf-forms/scripts/fill.py',
  ]);
  expect(snapshot.skipped).toStrictEqual(['fill.py']);
});

test('it fails the snapshot at a symlink that leads outside the root', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'secret.md'), 'outside\n');
  await mkdir(join(ctx.root, 'rules'));
  await symlink(join(ctx.dir, 'secret.md'), join(ctx.root, 'rules', 'escape.md'));

  expect(createPathSource({ dir: ctx.root }).snapshot()).rejects.toMatchObject({
    name: 'SnapshotError',
    message: 'a symlink leads outside the definitions root: rules/escape.md',
    paths: ['rules/escape.md'],
  });
});

test('it fails the snapshot at a symlink whose target does not exist', async () => {
  const ctx = await setupTest();

  await symlink(join(ctx.root, 'missing.md'), join(ctx.root, 'persona.md'));

  expect(createPathSource({ dir: ctx.root }).snapshot()).rejects.toMatchObject({
    name: 'SnapshotError',
    paths: ['persona.md'],
  });
});

test('it skips a symlink that stays inside the root', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'mail.yaml'), 'id: mail\n');
  await symlink(join(ctx.root, 'rules', 'mail.yaml'), join(ctx.root, 'rules', 'alias.yaml'));

  const snapshot = await createPathSource({ dir: ctx.root }).snapshot();

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
    dir: ctx.root,
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
    dir: ctx.root,
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
    dir: ctx.root,
    limits: { maxFileBytes: 10, maxTotalBytes: 10 },
  });

  const snapshot = await source.snapshot();

  expect(snapshot.skipped).toStrictEqual(['big.bin']);
});

test('it probes with the content hash, which changes after an edit', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const source = createPathSource({ dir: ctx.root });
  const before = await source.probe();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona, edited\n');

  const after = await source.probe();

  const persona = new TextEncoder().encode('# Persona\n');

  expect(before).toBe(buildContentHash(new Map([['persona.md', persona]])));
  expect(after).not.toBe(before);
});

test('it names the source by its directory', async () => {
  const ctx = await setupTest();

  const source = createPathSource({ dir: ctx.root });

  expect(source.id).toBe(`path:${ctx.root}`);
  expect(source.kind).toBe('path');
});

test('it gives the same directory written with a trailing slash the same source ID', async () => {
  const ctx = await setupTest();

  const plain = createPathSource({ dir: ctx.root });
  const slashed = createPathSource({ dir: `${ctx.root}/` });

  expect(slashed.id).toBe(plain.id);
});

// a readme, docs with a symlink that leaves the root, and a file that fails to parse
async function writeNonDefinitions(root: string, outside: string): Promise<void> {
  await writeFile(join(root, 'readme.md'), '# Definitions\n');
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs', 'readme.md'), '# Docs\n');
  await symlink(outside, join(root, 'docs', 'outside'));
  await mkdir(join(root, 'notes'));
  await writeFile(join(root, 'notes', 'bad.json'), '{ not json');
}
