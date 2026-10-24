import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import { writePromptExportState } from './write-prompt-export-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-export-state-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it marks an export in flight, then opens it with its pull request and drops the mark', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', null, '{}', '[]', 'current', 1, 1)`.execute(
    ctx.writer.db,
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writePromptExportState(tx, { approvalID: 'approval-a', to: 'exporting', at: 2 }),
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writePromptExportState(tx, {
      approvalID: 'approval-a',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 7, url: 'https://definitions.test/pull/7' },
      at: 3,
    }),
  );

  const exports = await sql`select * from prompt_exports`.execute(ctx.writer.db);
  const attempts = await sql`select * from prompt_export_attempts`.execute(ctx.writer.db);

  expect(exports.rows).toStrictEqual([
    {
      approval_id: 'approval-a',
      state: 'opened',
      pull_request_number: 7,
      pull_request_url: 'https://definitions.test/pull/7',
      updated_at: 3,
    },
  ]);

  expect(attempts.rows).toStrictEqual([]);
});

test('it closes an opened export', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', null, '{}', '[]', 'superseded', 1, 1)`.execute(
    ctx.writer.db,
  );

  await sql`insert into prompt_exports (approval_id, state, pull_request_number,
    pull_request_url, updated_at)
    values ('approval-a', 'opened', 7, 'https://definitions.test/pull/7', 2)`.execute(
    ctx.writer.db,
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writePromptExportState(tx, {
      approvalID: 'approval-a',
      to: 'closed',
      pullRequest: null,
      at: 3,
    }),
  );

  const exports = await sql`select state, updated_at from prompt_exports`.execute(ctx.writer.db);

  expect(exports.rows).toStrictEqual([{ state: 'closed', updated_at: 3 }]);
});

test('it records the pull request that a close found, for an export that never recorded one', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', null, '{}', '[]', 'superseded', 1, 1)`.execute(
    ctx.writer.db,
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writePromptExportState(tx, {
      approvalID: 'approval-a',
      to: 'closed',
      pullRequest: { number: 9, url: 'https://definitions.test/pull/9' },
      at: 3,
    }),
  );

  const exports = await sql`select * from prompt_exports`.execute(ctx.writer.db);

  expect(exports.rows).toStrictEqual([
    {
      approval_id: 'approval-a',
      state: 'closed',
      pull_request_number: 9,
      pull_request_url: 'https://definitions.test/pull/9',
      updated_at: 3,
    },
  ]);
});

test('it refuses to open a closed export', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', null, '{}', '[]', 'superseded', 1, 1)`.execute(
    ctx.writer.db,
  );

  await sql`insert into prompt_exports (approval_id, state, pull_request_number,
    pull_request_url, updated_at)
    values ('approval-a', 'closed', 7, 'https://definitions.test/pull/7', 2)`.execute(
    ctx.writer.db,
  );

  const refused = await withWriteTransaction(ctx.writer, (tx) =>
    writePromptExportState(tx, {
      approvalID: 'approval-a',
      to: 'opened',
      baseHash: null,
      pullRequest: { number: 8, url: 'https://definitions.test/pull/8' },
      at: 3,
    }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toStrictEqual(
    new Error('the export of prompt approval approval-a is closed, so it cannot become opened'),
  );
});
