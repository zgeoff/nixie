import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { loadSkillVersions } from './load-skill-versions';
import { readWrittenSkills } from './read-written-skills';
import { runSeed } from './run-seed';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { writeWrittenSkill } from './write-written-skill';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-written-skill-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({
    dataDir: directory,
    clock: { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() },
  });

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

test('it stores the skill in force with the definitions version it replaces as its base', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const base = seeded.inForce?.skills[0];

  invariant(base);

  const written = await readWrittenSkills(ctx.writer.db);

  expect(written).toStrictEqual([
    {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      name: 'tide-tables',
      skillHash: skill.skillHash,
      base: { name: 'tide-tables', skillHash: base.skillHash, origin: 'definitions' },
      definitions: { name: 'tide-tables', skillHash: base.skillHash, origin: 'definitions' },
      approvedAt: 1,
    },
  ]);
});

test('it keeps the version it stores readable by its hash', async () => {
  const ctx = await setupTest();

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
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

  const versions = await loadSkillVersions(ctx.writer.db, [skill.skillHash]);

  expect(versions.get(skill.skillHash)).toStrictEqual({
    name: 'tide-tables',
    skillHash: skill.skillHash,
    frontmatter: skill.frontmatter,
    files: skill.files,
  });
});

test('it supersedes the written version in force and keeps its base', async () => {
  const ctx = await setupTest();

  const first = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  const second = checkSkillFiles('tide-tables', [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ]);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: first,
      approvedAt: 1,
    }),
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 2,
    }),
  );

  const rows = await sql`select approval_id, state, base_hash from written_skills
    order by approved_at`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([
    { approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', state: 'superseded', base_hash: null },
    { approval_id: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74', state: 'in_force', base_hash: null },
  ]);
});

test("it keeps your definitions' version as the base when a second written version supersedes the first in force", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  const seeded = await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => policy });

  const first = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);
  const second = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By hour.\n` }]);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill: first,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, buildPolicy: () => policy });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      proposalID: 'w7tn4c9rhz',
      skill: second,
      approvedAt: 2,
    }),
  );

  const base = seeded.inForce?.skills[0];

  invariant(base);

  const written = await readWrittenSkills(ctx.writer.db);

  expect(written).toMatchObject([
    {
      approvalID: '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
      base: { name: 'tide-tables', skillHash: base.skillHash, origin: 'definitions' },
    },
  ]);
});
