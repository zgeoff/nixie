import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { PromptsTables } from '../types';
import { seedSupersededPromptApproval } from './seed-superseded-prompt-approval';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-seed-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    log: { writer, deploymentKey, projections: [] },
    clock: createFakeClock({ startMs: 1000 }),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };
}

test('it leaves the approval it returns superseded by a newer one of the same prompt', async () => {
  const ctx = await setupTest();
  const approval = await seedSupersededPromptApproval(ctx);

  const rows = await ctx.log.writer.db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .select(['approval_id', 'state'])
    .execute();

  expect(rows).toContainEqual({ approval_id: approval.approvalID, state: 'superseded' });
  expect(rows.map((row) => row.state).toSorted()).toStrictEqual(['current', 'superseded']);
});
