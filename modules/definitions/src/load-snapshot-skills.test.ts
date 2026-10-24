import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { loadSnapshotSkills } from './load-snapshot-skills';
import { runSeed } from './run-seed';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { writeWrittenSkill } from './write-written-skill';

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

test('it loads a skill that nixie wrote with origin nixie, its approval and its files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
    { path: 'ports.md', text: '# Ports\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const seeded = await runWrittenSkillSeed({ log: ctx.log, buildPolicy: () => policy });

  invariant(seeded.inForce);

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(skills).toStrictEqual([
    {
      name: 'tide-tables',
      skillHash: skill.skillHash,
      origin: 'nixie',
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      frontmatter: skill.frontmatter,
      files: new Map([
        ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'],
        ['ports.md', '# Ports\n'],
      ]),
    },
  ]);
});

test('it reads each skill of a snapshot with its frontmatter, its files and no approval', async () => {
  const ctx = await setupTest();

  const skill = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), skill);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(seeded.inForce);

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(skills).toStrictEqual([
    {
      name: 'tide-tables',
      skillHash: expect.any(String),
      origin: 'definitions',
      approvalID: null,
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
    buildPolicy: () => ({ rules: [], tools: [] }),
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
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  invariant(seeded.inForce);

  await sql`update skill_versions set frontmatter = json_remove(frontmatter, '$.description')`.execute(
    ctx.writer.db,
  );

  const read = loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ issues: [{ path: ['description'] }] });
});
