import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { createPathSource } from './create-path-source';
import { loadSnapshotSkills } from './load-snapshot-skills';
import { runSeed } from './run-seed';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-snapshot-skills-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(root);

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    writer,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
  };
}

test('it reads each skill of a snapshot with its frontmatter and files', async () => {
  const ctx = await setupTest();

  const skill = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), skill);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  invariant(seeded.inForce);

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(skills).toStrictEqual([
    {
      name: 'tide-tables',
      skillHash: expect.any(String),
      origin: 'definitions',
      frontmatter: {
        name: 'tide-tables',
        description: 'Reads a tide table.',
        license: null,
        compatibility: null,
        allowedTools: null,
        metadata: {},
      },
      files: new Map([['SKILL.md', skill]]),
    },
  ]);
});

test('it refuses a stored skill whose files hold a value that is not text', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  invariant(seeded.inForce);

  await sql`update skill_versions set files = '{"SKILL.md":7}'`.execute(ctx.writer.db);

  const read = loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ issues: [{ path: ['SKILL.md'] }] });
});

test('it refuses a stored skill whose frontmatter lacks a field', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  invariant(seeded.inForce);

  await sql`update skill_versions set frontmatter = json_remove(frontmatter, '$.description')`.execute(
    ctx.writer.db,
  );

  const read = loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ issues: [{ path: ['description'] }] });
});
