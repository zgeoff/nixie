import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { writeWrittenSkill } from './write-written-skill';
import { writeWrittenSkillState } from './write-written-skill-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-written-state-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({
    dataDir: directory,
    clock: { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() },
  });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it retires a written skill in force', async () => {
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

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    }),
  );

  const rows = await sql`select state, updated_at from written_skills`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([{ state: 'retired', updated_at: 2 }]);
});

test('it refuses to move a written skill that left force, and writes nothing', async () => {
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

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'adopted',
      at: 2,
    }),
  );

  const move = withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 3,
    }),
  );

  await Promise.allSettled([move]);

  const rows = await sql`select state, updated_at from written_skills`.execute(ctx.writer.db);

  expect(move).rejects.toMatchObject({ name: 'WrittenSkillStateError', state: 'adopted' });
  expect(rows.rows).toStrictEqual([{ state: 'adopted', updated_at: 2 }]);
});

test('it refuses an approval that applied no skill', async () => {
  const ctx = await setupTest();

  const move = withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 1,
    }),
  );

  expect(move).rejects.toMatchObject({ name: 'WrittenSkillStateError', state: null });
});
