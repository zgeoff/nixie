import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useConversationRecords } from './use-conversation-records';

async function setupTest() {
  await createDeviceSession();
}

test('it shows each record of the page and the live stream once, in order', async () => {
  await setupTest();

  const one = await store.records.create({ kind: 'owner_message' });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  const two = await store.records.create({ kind: 'assistant_message' });

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.sequence)).toStrictEqual([
      one.sequence,
      two.sequence,
    ]);
  });
});

test('it drops the text of a message once a forget on the live stream names it', async () => {
  await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  await store.records.create({ forget: { sequence: message.sequence }, kind: 'record.forgotten' });

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(2);
  });

  expect(hook.result.current.records.at(0)).toStrictEqual({
    kind: 'owner_message',
    recordedAt: message.recordedAt,
    sequence: message.sequence,
    thread: 'conversation',
  });
});

test('it drops the text of a summary once a forget invalidates its session', async () => {
  await setupTest();

  await store.records.create({ kind: 'model.session_opened' });

  const summary = await store.records.create({
    kind: 'model.session_summarized',
    summary: { summaryTokens: 900, text: 'Open threads: the gate code.', trigger: 'threshold' },
  });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.records.at(-1)?.summary?.text).toBe('Open threads: the gate code.');
  });

  await store.records.create({ kind: 'model.session_invalidated' });

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(3);
  });

  expect(hook.result.current.records.at(1)).toStrictEqual({
    kind: 'model.session_summarized',
    recordedAt: summary.recordedAt,
    sequence: summary.sequence,
    summary: { summaryTokens: 900, trigger: 'threshold' },
    thread: 'conversation',
  });
});

test('it drops the text of a summary that commits after a forget invalidated its session', async () => {
  await setupTest();

  await store.records.create({ kind: 'model.session_opened' });
  await store.records.create({ kind: 'model.session_invalidated' });

  await store.records.create({
    kind: 'model.session_summarized',
    summary: { summaryTokens: 900, text: 'Open threads: the gate code.', trigger: 'threshold' },
  });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(3);
  });

  expect(hook.result.current.records.at(-1)?.summary).toStrictEqual({
    summaryTokens: 900,
    trigger: 'threshold',
  });
});

test('it keeps the text of a summary from a session that opened after the last forget', async () => {
  await setupTest();

  await store.records.create({ kind: 'model.session_invalidated' });
  await store.records.create({ kind: 'model.session_opened' });

  await store.records.create({
    kind: 'model.session_summarized',
    summary: { summaryTokens: 900, text: 'Open threads: the porch light.', trigger: 'threshold' },
  });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(3);
  });

  expect(hook.result.current.records.at(-1)?.summary?.text).toBe('Open threads: the porch light.');
});

test('it names the client message ID of a message a forget dropped the text of', async () => {
  await setupTest();

  const message = await store.records.create({
    kind: 'owner_message',
    message: {
      clientMessageId: '3d7e1a9c-5b2f-4e8d-a6c0-9f1b4e7d2a53',
      text: 'Pick up the parcel.',
    },
  });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  await store.records.create({ forget: { sequence: message.sequence }, kind: 'record.forgotten' });

  await waitFor(() => {
    expect(hook.result.current.forgottenClientMessageIDs).toStrictEqual([
      '3d7e1a9c-5b2f-4e8d-a6c0-9f1b4e7d2a53',
    ]);
  });
});

test('it reports the conversation failed when the first read fails', async () => {
  await setupTest();

  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('failed');
  });
});

test('it drops the records from before a reset once the reset arrives', async () => {
  await setupTest();

  await store.records.create({ kind: 'owner_message' });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(1);
  });

  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));
  store.records.clear();

  const reset = await store.records.create({ kind: 'log_reset' });
  const next = await store.records.create({ kind: 'assistant_message' });

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.sequence)).toStrictEqual([
      reset.sequence,
      next.sequence,
    ]);
  });
});

test('it reads the conversation again when a reset arrives', async () => {
  await setupTest();

  const reads = mock();

  server.use(
    http.post('*/rpc/conversation/read', () => {
      reads();
    }),
  );

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(reads).toHaveBeenCalledTimes(2);
  });
});

test('it reads the conversation again once the live stream reconnects after a reset', async () => {
  await setupTest();

  const failed = mock();
  const reads = mock();
  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  server.use(
    http.post(
      '*/rpc/conversation/read',
      () => {
        failed();

        return new HttpResponse(null, { status: 503 });
      },
      { once: true },
    ),
    http.post('*/rpc/conversation/read', () => {
      reads();
    }),
  );

  await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(failed).toHaveBeenCalledOnce();
  });

  globalThis.dispatchEvent(new Event('online'));

  await waitFor(() => {
    expect(reads).toHaveBeenCalledOnce();
  });
});

test('it keeps the conversation ready when the read after a reset fails', async () => {
  await setupTest();

  const failed = mock();
  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  server.use(
    http.post('*/rpc/conversation/read', () => {
      failed();

      return new HttpResponse(null, { status: 503 });
    }),
  );

  await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(failed).toHaveBeenCalledOnce();
  });

  const next = await store.records.create({ kind: 'assistant_message' });

  await waitFor(() => {
    expect(hook.result.current.records.at(-1)?.sequence).toBe(next.sequence);
  });

  expect(hook.result.current.status).toBe('ready');
});

test('it drops the step end a page read before a reset once the reset arrives', async () => {
  await setupTest();

  await store.records.create({
    kind: 'task.step_errored',
    task: { stepKey: 'conversation:1', taskID: 'conversation' },
  });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.lastStepEnd?.kind).toBe('task.step_errored');
  });

  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));
  store.records.clear();

  const reset = await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(hook.result.current.liveResetSequence).toBe(reset.sequence);
  });

  expect(hook.result.current.lastStepEnd).toBeNull();
});

test('it keeps a step end that follows the reset the page read', async () => {
  await setupTest();

  await store.records.create({ kind: 'log_reset' });

  const step = await store.records.create({
    kind: 'task.step_errored',
    task: { stepKey: 'conversation:1', taskID: 'conversation' },
  });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  expect(hook.result.current.lastStepEnd?.sequence).toBe(step.sequence);
});

test('it names a reset the live stream delivers, and not one the page read', async () => {
  await setupTest();

  await store.records.create({ kind: 'log_reset' });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  const read = hook.result.current.liveResetSequence;

  const reset = await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(hook.result.current.liveResetSequence).toBe(reset.sequence);
  });

  expect(read).toBeUndefined();
});
