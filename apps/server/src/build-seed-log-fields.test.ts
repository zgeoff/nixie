import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  buildContentHash,
  buildDefinitionsSnapshot,
  createPathSource,
  runSeed,
} from '@heynixie/definitions';
import { startWriter } from '@heynixie/log';
import { buildSeedLogFields } from './build-seed-log-fields';

const policy = { rules: [{ id: 'slice1.read-only' }], tools: [] };

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-seed-log-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const root = join(dir, 'definitions');
  const writer = await startWriter({ dataDir: dir });

  stack.defer(() => writer.stop());
  await mkdir(root);

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    write: async (path: string, contents: string | Uint8Array) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), contents);
    },
    seed: async () => {
      const result = await runSeed({
        log: { writer, deploymentKey, projections: [] },
        source: createPathSource({ dir: root }),
        policy,
      });

      return buildSeedLogFields(result);
    },
  };
}

const encoder = new TextEncoder();

test('it logs the revision, the content hash and the snapshot hash a seed put in force', async () => {
  const ctx = await setupTest();

  await ctx.write('nixie.yaml', 'format: 1\n');
  await ctx.write('persona.md', '# Persona\n');

  const contentHash = buildContentHash(
    new Map([
      ['nixie.yaml', encoder.encode('format: 1\n')],
      ['persona.md', encoder.encode('# Persona\n')],
    ]),
  );
  const built = buildDefinitionsSnapshot({ persona: '# Persona\n', policy });

  const fields = await ctx.seed();

  expect(fields).toStrictEqual({
    status: 'seeded',
    inForceRevision: contentHash,
    inForceContentHash: contentHash,
    inForceSnapshotHash: built.snapshotHash,
  });
});

test('it logs the same fields for a seed of the same files', async () => {
  const ctx = await setupTest();

  await ctx.write('nixie.yaml', 'format: 1\n');
  await ctx.write('persona.md', '# Persona\n');
  const first = await ctx.seed();
  const second = await ctx.seed();

  expect(second).toStrictEqual({ ...first, status: 'unchanged' });
});

test('it logs a new revision and content hash for a changed file the seed leaves unapplied', async () => {
  const ctx = await setupTest();

  await ctx.write('nixie.yaml', 'format: 1\n');
  await ctx.write('persona.md', '# Persona\n');
  await ctx.write('rules/quiet.yaml', 'id: quiet\n');
  const first = await ctx.seed();

  await ctx.write('rules/quiet.yaml', 'id: quieter\n');
  const second = await ctx.seed();

  // the snapshot hash covers only the definitions in force, and the rule is not in force
  expect(second).toMatchObject({
    status: 'seeded',
    inForceSnapshotHash: first['inForceSnapshotHash'],
  });
  expect(second['inForceRevision']).not.toBe(first['inForceRevision']);
  expect(second['inForceContentHash']).not.toBe(first['inForceContentHash']);
});

test('it logs a new snapshot hash for a changed persona', async () => {
  const ctx = await setupTest();

  await ctx.write('nixie.yaml', 'format: 1\n');
  await ctx.write('persona.md', '# Persona\n');
  const first = await ctx.seed();

  await ctx.write('persona.md', '# Another persona\n');
  const second = await ctx.seed();

  expect(second['inForceRevision']).not.toBe(first['inForceRevision']);
  expect(second['inForceContentHash']).not.toBe(first['inForceContentHash']);
  expect(second['inForceSnapshotHash']).not.toBe(first['inForceSnapshotHash']);
});

test('it logs the error and the last good seed for a refused seed', async () => {
  const ctx = await setupTest();

  await ctx.write('nixie.yaml', 'format: 1\n');
  await ctx.write('persona.md', '# Persona\n');
  const first = await ctx.seed();

  // a compiled Python file under a skill is kept, and fails to decode as UTF-8
  await ctx.write('skills/notes/helper.pyc', new Uint8Array([0xff, 0xfe]));

  const fields = await ctx.seed();

  expect(fields).toStrictEqual({ ...first, status: 'refused', error: 'DefinitionsParseError' });
});

test('it logs no definitions in force for a refused first seed', async () => {
  const ctx = await setupTest();

  await ctx.write('nixie.yaml', 'format: 1\n');

  const fields = await ctx.seed();

  expect(fields).toStrictEqual({
    status: 'refused',
    inForceRevision: null,
    inForceContentHash: null,
    inForceSnapshotHash: null,
    error: 'DefinitionsParseError',
  });
});
