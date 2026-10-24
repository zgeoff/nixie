import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { readWrittenSkills } from './read-written-skills';
import { runSeed } from './run-seed';
import { writeWrittenSkill } from './write-written-skill';
import { writeWrittenSkillBase } from './write-written-skill-base';
import { writeWrittenSkillState } from './write-written-skill-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-written-base-'));

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

test("it makes the definitions' newest version the base, which closes the conflict", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';
  const policy = { rules: [], tools: [] };

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);
  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => policy });

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

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), `${text}By hour.\n`);
  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => policy });

  const name = await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillBase(tx, { approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', at: 2 }),
  );

  const [written] = await readWrittenSkills(ctx.writer.db);

  invariant(written);

  expect(name).toBe('tide-tables');
  expect(written.base).toStrictEqual(written.definitions);
});

test('it refuses a written skill that left force', async () => {
  const ctx = await setupTest();

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    });

    await writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    });
  });

  const refusal = await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillBase(tx, { approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', at: 3 }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toMatchObject({ name: 'WrittenSkillStateError', state: 'retired' });
});
