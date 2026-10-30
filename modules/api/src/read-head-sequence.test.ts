import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readHeadSequence } from './read-head-sequence';
import { startTestAPI } from './test-utils/start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it reads the sequence of the newest record', async () => {
  const ctx = await setupTest();

  const [, newest] = await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: { taskID: 'k3x9m2p7qa', isConversation: false, state: 'ready' },
    },
    {
      kind: 'task.paused',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: { taskID: 'k3x9m2p7qa', resumeState: 'ready' },
    },
  ]);

  invariant(newest);

  const head = await readHeadSequence(ctx.context);

  expect(head).toBe(newest.sequence);
});

test('it reads 0 from a log with no record', async () => {
  const ctx = await setupTest();
  const head = await readHeadSequence(ctx.context);

  expect(head).toBe(0);
});
