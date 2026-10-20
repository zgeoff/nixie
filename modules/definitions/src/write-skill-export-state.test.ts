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

test('it marks a first export in flight with no export row', async () => {
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
      at: 2,
    }),
  );

  const exports = await sql`select * from skill_exports`.execute(ctx.writer.db);
  const attempts = await sql`select * from skill_export_attempts`.execute(ctx.writer.db);

  expect(exports.rows).toStrictEqual([]);

  expect(attempts.rows).toStrictEqual([
    { approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', started_at: 2 },
  ]);
});

test('it clears the mark of an export in flight when its pull request opens', async () => {
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

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      at: 2,
    });
  });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 3,
    }),
  );

  const attempts = await sql`select * from skill_export_attempts`.execute(ctx.writer.db);

  expect(attempts.rows).toStrictEqual([]);
});

test('it records the pull request that an export in flight found when it closes', async () => {
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

    await writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'exporting',
      at: 2,
    });
  });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'closed',
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 3,
    }),
  );

  const exports = await sql`select * from skill_exports`.execute(ctx.writer.db);
  const attempts = await sql`select * from skill_export_attempts`.execute(ctx.writer.db);

  expect(exports.rows).toStrictEqual([
    {
      approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      state: 'closed',
      base_hash: null,
      pull_request_number: 7,
      pull_request_url: 'https://definitions.test/pull/7',
      updated_at: 3,
    },
  ]);

  expect(attempts.rows).toStrictEqual([]);
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
      at: 3,
    }),
  );

  const exports = await sql`select * from skill_exports`.execute(ctx.writer.db);
  const attempts = await sql`select * from skill_export_attempts`.execute(ctx.writer.db);

  expect(exports.rows).toStrictEqual([
    {
      approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      state: 'opened',
      base_hash: null,
      pull_request_number: 7,
      pull_request_url: 'https://definitions.test/pull/7',
      updated_at: 2,
    },
  ]);

  expect(attempts.rows).toStrictEqual([
    { approval_id: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31', started_at: 3 },
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
      pullRequest: null,
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
