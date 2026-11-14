import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import type { PromptsTables } from '../types';
import { seedPromptApproval } from './seed-prompt-approval';

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
    clock: buildTestClock(1000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };
}

test('it leaves a current approval of the prompt it is given', async () => {
  const ctx = await setupTest();
  const approval = await seedPromptApproval(ctx, { promptID: 'consolidator' });

  const rows = await ctx.log.writer.db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .select(['approval_id', 'prompt_id', 'state'])
    .execute();

  expect(rows).toStrictEqual([
    { approval_id: approval.approvalID, prompt_id: 'consolidator', state: 'current' },
  ]);
});
