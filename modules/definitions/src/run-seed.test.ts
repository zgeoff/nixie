import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Projection } from '@heynixie/log';
import { startWriter } from '@heynixie/log';
import { sql } from 'kysely';
import { buildContentHash } from './build-content-hash';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import { createPathSource } from './create-path-source';
import { runSeed } from './run-seed';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest(config: { readonly projections?: readonly Projection[] } = {}) {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-seed-'));

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
    dir,
    root,
    writer,
    log: { writer, deploymentKey, projections: config.projections ?? [] },
    source: createPathSource({ dir: root }),
  };
}

test('it seeds the persona and records the source ID, the revision and the content hash', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [{ id: 'slice1.read-only' }], tools: [] };
  const result = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const manifest = new TextEncoder().encode('format: 1\n');
  const persona = new TextEncoder().encode('# Persona\n');
  const files = new Map([
    ['nixie.yaml', manifest],
    ['persona.md', persona],
  ]);
  const built = buildDefinitionsSnapshot({ persona: '# Persona\n', policy });

  expect(result).toMatchObject({
    status: 'seeded',
    record: {
      sequence: 1,
      kind: 'definitions_seeded',
      definitions: { snapshotHash: built.snapshotHash, personaVersion: built.personaVersion },
      payload: {
        sourceID: `path:${ctx.root}`,
        sourceKind: 'path',
        revision: buildContentHash(files),
        contentHash: buildContentHash(files),
        formatVersion: 1,
        policyHash: built.policyHash,
        unapplied: [],
        skipped: [],
      },
    },
  });
});

test('it returns the definitions it put in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\r\n\r\nWarm, brief.');

  const policy = { rules: [], tools: [] };
  const result = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const snapshot = await ctx.source.snapshot();
  const built = buildDefinitionsSnapshot({ persona: '# Persona\n\nWarm, brief.\n', policy });

  expect(result.inForce).toStrictEqual({
    seededAt: expect.toBeValidDate(),
    sourceID: `path:${ctx.root}`,
    sourceKind: 'path',
    revision: snapshot.revision,
    contentHash: snapshot.contentHash,
    formatVersion: 1,
    snapshotHash: built.snapshotHash,
    personaVersion: built.personaVersion,
    persona: '# Persona\n\nWarm, brief.\n',
    recordSequence: 1,
  });
});

test('it keeps the snapshot under its hash with the revision as its label', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch'] }] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const snapshot = await ctx.source.snapshot();
  const built = buildDefinitionsSnapshot({ persona: '# Persona\n', policy });
  const snapshots = await sql`select snapshot_hash, persona_version, policy_hash, form, label
    from definition_snapshots`.execute(ctx.writer.db);

  expect(snapshots.rows).toStrictEqual([
    {
      snapshot_hash: built.snapshotHash,
      persona_version: built.personaVersion,
      policy_hash: built.policyHash,
      form: built.form,
      label: snapshot.revision,
    },
  ]);
});

test('it lists each policy file it left unapplied and each path the filter skipped', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'mail.yaml'), 'id: mail\noutcome: deny\n');
  await writeFile(join(ctx.root, 'rules', 'web.yaml'), 'id: web\noutcome: allow\n');
  await writeFile(join(ctx.root, 'README.txt'), 'not a definition\n');

  const result = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  expect(result).toMatchObject({
    status: 'seeded',
    record: {
      payload: { unapplied: ['rules/mail.yaml', 'rules/web.yaml'], skipped: ['README.txt'] },
    },
  });
});

test('it keeps the last seed when a later snapshot fails to parse', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };
  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: [1\n');

  const result = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const seeds = await sql`select seed, record_sequence from definition_seeds`.execute(
    ctx.writer.db,
  );

  expect(result).toMatchObject({
    status: 'refused',
    error: { name: 'DefinitionsParseError', problems: [{ path: 'nixie.yaml' }] },
    inForce: first.inForce,
  });
  expect(seeds.rows).toStrictEqual([{ seed: 1, record_sequence: 1 }]);
});

test('it writes no record for a snapshot it refuses', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });
  await writeFile(join(ctx.root, 'persona.md'), '');
  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const records = await sql`select sequence, kind from records`.execute(ctx.writer.db);

  expect(records.rows).toStrictEqual([{ sequence: 1, kind: 'definitions_seeded' }]);
});

test('it keeps the last seed when the source refuses the snapshot', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };
  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  await writeFile(join(ctx.dir, 'secret.md'), 'outside\n');
  await mkdir(join(ctx.root, 'rules'));
  await symlink(join(ctx.dir, 'secret.md'), join(ctx.root, 'rules', 'escape.md'));

  const result = await runSeed({ log: ctx.log, source: ctx.source, policy });

  expect(result).toMatchObject({
    status: 'refused',
    error: { name: 'SnapshotError', paths: ['rules/escape.md'] },
    inForce: first.inForce,
  });
});

test('it refuses a first snapshot that fails to parse and leaves no seed', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const result = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const seeds = await sql`select seed from definition_seeds`.execute(ctx.writer.db);

  expect(result).toMatchObject({
    status: 'refused',
    error: { name: 'DefinitionsParseError' },
    inForce: null,
  });
  expect(seeds.rows).toStrictEqual([]);
});

test('it writes nothing when the newest seed already holds the same definitions', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };
  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });
  const result = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const records = await sql`select sequence from records`.execute(ctx.writer.db);

  expect(result.status).toBe('unchanged');
  expect(result.inForce).toStrictEqual(first.inForce);
  expect(records.rows).toStrictEqual([{ sequence: 1 }]);
});

test('it puts an edited persona in force under a new snapshot hash', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });
  await writeFile(join(ctx.root, 'persona.md'), '# Persona, edited\n');

  const result = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const built = buildDefinitionsSnapshot({ persona: '# Persona, edited\n', policy });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: { snapshotHash: built.snapshotHash, recordSequence: 2 },
  });
});

test('it seeds again when a release changes a tool declaration over the same files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const before = { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch'] }] };
  const after = { rules: [], tools: [{ name: 'web_fetch', effects: ['fetch', 'send'] }] };
  const first = await runSeed({ log: ctx.log, source: ctx.source, policy: before });
  const result = await runSeed({ log: ctx.log, source: ctx.source, policy: after });

  const built = buildDefinitionsSnapshot({ persona: '# Persona\n', policy: after });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: { contentHash: first.inForce?.contentHash, snapshotHash: built.snapshotHash },
  });
});

test('it rolls the whole seed back when its record fails to write', async () => {
  const failingFold: Projection = {
    table: 'threads',
    keyColumn: 'thread',
    fold: () => Promise.reject(new Error('the fold failed')),
  };
  const ctx = await setupTest({ projections: [failingFold] });

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seed = runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  await seed.catch(() => {});

  const rows = await sql`select
    (select count(*) from personas) as personas,
    (select count(*) from definition_snapshots) as snapshots,
    (select count(*) from definition_seeds) as seeds,
    (select count(*) from records) as records`.execute(ctx.writer.db);

  expect(seed).rejects.toThrowWithMessage(Error, 'the fold failed');
  expect(rows.rows).toStrictEqual([{ personas: 0, snapshots: 0, seeds: 0, records: 0 }]);
});
