import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { runSeed } from './run-seed';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { writeWrittenSkill } from './write-written-skill';
import { writeWrittenSkillState } from './write-written-skill-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-written-seed-'));

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

test('it puts an approved skill in force at once, on the revision in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\nskills: []\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'notes.md'), '# Notes\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);
  invariant(first.inForce);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  const result = await runWrittenSkillSeed({ log: ctx.log, policy });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: {
      revision: first.inForce.revision,
      contentHash: first.inForce.contentHash,
      skills: [{ name: 'tide-tables', skillHash: skill.skillHash, origin: 'nixie' }],
      conversationSkills: ['tide-tables'],
    },
    record: {
      payload: {
        revision: first.inForce.revision,
        skillChanges: { added: ['tide-tables'], changed: [], removed: [] },
        skipped: ['notes.md'],
      },
    },
  });
});

test('it gives a retired written skill back to the version beneath it, in its list place', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);
  invariant(first.inForce);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    }),
  );

  const result = await runWrittenSkillSeed({ log: ctx.log, policy });

  expect(result).toMatchObject({
    status: 'seeded',
    inForce: {
      snapshotHash: first.inForce.snapshotHash,
      skills: first.inForce.skills,
      conversationSkills: ['tide-tables'],
    },
  });
});

test('it writes nothing when the written skills already stand in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });
  const result = await runWrittenSkillSeed({ log: ctx.log, policy });

  invariant(first.inForce);

  expect(result).toStrictEqual({ status: 'unchanged', inForce: first.inForce });
});

test('it refuses before the first seed', async () => {
  const ctx = await setupTest();
  const result = await runWrittenSkillSeed({ log: ctx.log, policy: { rules: [], tools: [] } });

  expect(result).toMatchObject({
    status: 'refused',
    error: { message: 'no definitions are in force yet' },
    inForce: null,
  });
});
