import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import { PromptApprovalStateError } from './prompt-approval-state-error';
import { writePromptApprovalState } from './write-prompt-approval-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-approval-state-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it supersedes a current approval', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', null, '{}', '[]', 'current', 1, 1)`.execute(
    ctx.writer.db,
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writePromptApprovalState(tx, { approvalID: 'approval-a', to: 'superseded', at: 2 }),
  );

  const rows = await sql`select state, updated_at from prompt_approvals`.execute(ctx.writer.db);

  expect(rows.rows).toStrictEqual([{ state: 'superseded', updated_at: 2 }]);
});

test('it refuses to make a superseded approval current again', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', null, '{}', '[]', 'superseded', 1, 1)`.execute(
    ctx.writer.db,
  );

  const refused = await withWriteTransaction(ctx.writer, (tx) =>
    writePromptApprovalState(tx, { approvalID: 'approval-a', to: 'current', at: 2 }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toStrictEqual(
    new PromptApprovalStateError('approval-a', 'superseded', 'current'),
  );
});

test('it refuses to move an approval that does not exist', async () => {
  const ctx = await setupTest();

  const refused = await withWriteTransaction(ctx.writer, (tx) =>
    writePromptApprovalState(tx, { approvalID: 'approval-a', to: 'superseded', at: 2 }),
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toStrictEqual(new PromptApprovalStateError('approval-a', null, 'superseded'));
});
