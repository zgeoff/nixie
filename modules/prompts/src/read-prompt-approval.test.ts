import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, writeRecords } from '@heynixie/log';
import { sql } from 'kysely';
import { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';
import { readPromptApproval } from './read-prompt-approval';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-approval-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { writer, log: { writer, deploymentKey, projections: [] } };
}

test('it reads the approved entry and files with the reason of the proposal', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: 'hash-a',
        baseHash: null,
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await sql`insert into prompt_approvals (approval_id, proposal_id, prompt_id, thread, entry,
    files, state, approved_at, updated_at)
    values ('approval-a', 'k3x9m2p7qa', 'compaction', 'conversation',
      '{"safety":"prompts/compaction-safety.md"}',
      '[{"path":"prompts/compaction-safety.md","text":"Answer with the summary alone.\\n"}]',
      'current', 1, 1)`.execute(ctx.writer.db);

  const approval = await readPromptApproval(ctx.writer.db, 'approval-a');

  expect(approval).toStrictEqual({
    approvalID: 'approval-a',
    proposalID: 'k3x9m2p7qa',
    promptID: 'compaction',
    entry: { safety: 'prompts/compaction-safety.md' },
    files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
    reason: 'Drop the instruction part.',
  });
});
