import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { writeSkillExportState } from './write-skill-export-state';
import { writeWrittenSkill } from './write-written-skill';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-export-state-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it opens the export of an approval with its pull request and base', async () => {
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
    writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 2,
    }),
  );

  const rows = await sql`select * from skill_exports`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([
    {
      approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      state: 'opened',
      base_hash: null,
      pull_request_number: 7,
      pull_request_url: 'https://definitions.test/pull/7',
      updated_at: 2,
    },
  ]);
});

test('it records a first export in flight with no pull request', async () => {
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
    writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      baseHash: null,
      at: 2,
    }),
  );

  const rows = await sql`select * from skill_exports`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([
    {
      approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      state: 'exporting',
      base_hash: null,
      pull_request_number: null,
      pull_request_url: null,
      updated_at: 2,
    },
  ]);
});

test('it keeps the pull request of an opened export that exports again on a new base', async () => {
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
    writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 2,
    }),
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      baseHash: 'base-b',
      at: 3,
    }),
  );

  const rows = await sql`select * from skill_exports`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([
    {
      approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      state: 'exporting',
      base_hash: 'base-b',
      pull_request_number: 7,
      pull_request_url: 'https://definitions.test/pull/7',
      updated_at: 3,
    },
  ]);
});

test('it refuses to open again an export that closed', async () => {
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

  await withWriteTransaction(ctx.writer, async (tx) => {
    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 2,
    });

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'closed',
      at: 3,
    });
  });

  const refused = await withWriteTransaction(ctx.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 8, url: 'https://definitions.test/pull/8' },
      at: 4,
    }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toStrictEqual(
    new Error(
      'the export of approval 5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31 is closed, so it cannot become opened',
    ),
  );
});
