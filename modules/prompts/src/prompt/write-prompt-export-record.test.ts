import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import { writePromptExportRecord } from './write-prompt-export-record';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-export-record-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { writer, log: { writer, deploymentKey, projections: [] } };
}

test('it records the pull request of an export on the thread of the approved proposal', async () => {
  const ctx = await setupTest();

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', 'conversation', '{}', '[]', 'current', 1, 1)`.execute(
    ctx.writer.db,
  );

  await withWriteTransaction(ctx.writer, (tx) =>
    writePromptExportRecord(tx, ctx.log, {
      approvalID: 'approval-a',
      pullRequestURL: 'https://definitions.test/pull/4',
      definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
    }),
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_exported'],
  });

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      thread: 'conversation',
      definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
      payload: {
        proposalID: 'k3x9m2p7qa',
        approvalID: 'approval-a',
        pullRequestURL: 'https://definitions.test/pull/4',
      },
    },
  ]);
});
