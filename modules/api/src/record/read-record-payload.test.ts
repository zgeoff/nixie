import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { startTestAPI } from '../test-utils/start-test-api';
import { readRecordPayload } from './read-record-payload';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const [called] = await writeRecords(api.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        tool: 'web.fetch',
        model: 'test-model',
        profile: 'test',
      },
      erasable: { input: { url: 'https://cafe-list.test/north', note: 'n'.repeat(9000) } },
    },
  ]);

  invariant(called);

  return { ...api, sequence: called.sequence };
}

test('it reads the whole input of a tool call', async () => {
  const ctx = await setupTest();

  const payload = await readRecordPayload(ctx.context, {
    thread: 'conversation',
    sequence: ctx.sequence,
  });

  expect(payload).toStrictEqual({
    status: 'readable',
    toolCall: { input: { url: 'https://cafe-list.test/north', note: 'n'.repeat(9000) } },
  });
});

test('it reads a record of another thread as not found', async () => {
  const ctx = await setupTest();

  const payload = await readRecordPayload(ctx.context, {
    thread: 'k3vq8m2xpa',
    sequence: ctx.sequence,
  });

  expect(payload).toStrictEqual({ status: 'not_found' });
});

test('it reads a sequence that holds no record as not found', async () => {
  const ctx = await setupTest();

  const payload = await readRecordPayload(ctx.context, {
    thread: 'conversation',
    sequence: ctx.sequence + 500,
  });

  expect(payload).toStrictEqual({ status: 'not_found' });
});

test('it reports a record whose key is gone as forgotten', async () => {
  const ctx = await setupTest();

  await removeTestRecordKey(ctx.context.log, ctx.sequence);

  const payload = await readRecordPayload(ctx.context, {
    thread: 'conversation',
    sequence: ctx.sequence,
  });

  expect(payload).toStrictEqual({ status: 'forgotten' });
});

test('it reports a record whose key fails to unwrap as unreadable', async () => {
  const ctx = await setupTest();

  const otherKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const payload = await readRecordPayload(
    { ...ctx.context, log: { ...ctx.context.log, deploymentKey: otherKey } },
    { thread: 'conversation', sequence: ctx.sequence },
  );

  expect(payload).toStrictEqual({ status: 'unreadable' });
});
