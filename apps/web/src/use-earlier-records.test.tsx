import { expect, mock, onTestFinished, test } from 'bun:test';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { buildBrowserClient } from './build-browser-client';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useEarlierRecords } from './use-earlier-records';

test('it reads earlier pages of the thread until it holds the linked message', async () => {
  await createDeviceSession();

  await store.records.create({
    kind: 'task_message',
    taskMessage: { from: 'k3vq8m2xpa', fromName: 'Garden plan', messageID: 'm7q2x9k4pa' },
    thread: 'p7hd2wq9zn',
  });

  const later = await Promise.all(
    Array.from({ length: 80 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  const oldestShown = later.toSorted((left, right) => left.sequence - right.sequence).at(70);

  if (oldestShown === undefined) {
    throw new Error('the thread holds 80 later records');
  }

  const hook = renderHook(() =>
    useEarlierRecords({
      messageID: 'm7q2x9k4pa',
      page: {
        hasEarlier: true,
        records: [
          buildMockLogRecord({ kind: 'task.step_started', sequence: oldestShown.sequence }),
        ],
      },
      thread: 'p7hd2wq9zn',
    }),
  );

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.taskMessage?.messageID)).toContain(
      'm7q2x9k4pa',
    );
  });

  expect(hook.result.current.isFailed).toBe(false);
});

test('it stops reading earlier pages after one fails, and reads it again on a retry, not on focus or reconnect', async () => {
  const reads = mock<(body: unknown) => void>();

  await createDeviceSession();

  server.use(
    http.post('*/rpc/conversation/read', async (info) => {
      const body: unknown = await info.request.clone().json();

      reads(body);

      return HttpResponse.error();
    }),
  );

  // MSW tries the handlers of the last call first, so the first earlier page loads and every
  // later page fails.
  server.use(
    http.post(
      '*/rpc/conversation/read',
      () =>
        HttpResponse.json({
          json: {
            hasEarlier: true,
            lastStepEnd: null,
            readAtSequence: 90,
            records: [
              {
                kind: 'task.step_started',
                recordedAt: '2026-05-04T09:30:00.000Z',
                sequence: 40,
                thread: 'p7hd2wq9zn',
              },
            ],
          },
          meta: [[1, 'records', 0, 'recordedAt']],
        }),
      { once: true },
    ),
  );

  const hook = renderHook(() =>
    useEarlierRecords({
      messageID: 'm7q2x9k4pa',
      page: {
        hasEarlier: true,
        records: [buildMockLogRecord({ kind: 'task.step_started', sequence: 90 })],
      },
      thread: 'p7hd2wq9zn',
    }),
  );

  await waitFor(() => {
    expect(hook.result.current.isFailed).toBe(true);
  });

  onTestFinished(() => {
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  });

  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });

  const client = buildBrowserClient();

  // Each probe reaches the recorder after any read the hook started before it.
  await client.conversation.read({ thread: 'p7hd2wq9zn' }).then(
    () => null,
    (error: unknown) => error,
  );

  const readsAfterFocus = reads.mock.calls.length;

  act(() => {
    hook.result.current.onRetry();
  });

  await waitFor(() => {
    expect(reads).toHaveBeenCalledTimes(3);
  });

  await waitFor(() => {
    expect(hook.result.current.isFailed).toBe(true);
  });

  hook.rerender();

  await client.conversation.read({ thread: 'p7hd2wq9zn' }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(readsAfterFocus).toBe(2);

  expect(reads.mock.calls.map(([body]) => body)).toStrictEqual([
    { json: { beforeSequence: 40, thread: 'p7hd2wq9zn' } },
    { json: { thread: 'p7hd2wq9zn' } },
    { json: { beforeSequence: 40, thread: 'p7hd2wq9zn' } },
    { json: { thread: 'p7hd2wq9zn' } },
  ]);
});

test('it asks again for the later page that failed when you retry, and finds the linked message there', async () => {
  const bodies = mock<(body: unknown) => void>();

  await createDeviceSession();

  await store.records.create({
    kind: 'task_message',
    taskMessage: { from: 'k3vq8m2xpa', fromName: 'Garden plan', messageID: 'm7q2x9k4pa' },
    thread: 'p7hd2wq9zn',
  });

  server.use(http.post('*/rpc/conversation/read', () => HttpResponse.error(), { once: true }));

  server.use(
    http.post(
      '*/rpc/conversation/read',
      () =>
        HttpResponse.json({
          json: {
            hasEarlier: true,
            lastStepEnd: null,
            readAtSequence: 90,
            records: [
              {
                kind: 'task.step_started',
                recordedAt: '2026-05-04T09:30:00.000Z',
                sequence: 40,
                thread: 'p7hd2wq9zn',
              },
            ],
          },
          meta: [[1, 'records', 0, 'recordedAt']],
        }),
      { once: true },
    ),
  );

  // MSW tries the handlers of the last call first, so the recorder sees every read, the first
  // earlier page loads, the next page fails once, and the mock API answers the retry.
  server.use(
    http.post('*/rpc/conversation/read', async (info) => {
      const body: unknown = await info.request.clone().json();

      bodies(body);
    }),
  );

  const hook = renderHook(() =>
    useEarlierRecords({
      messageID: 'm7q2x9k4pa',
      page: {
        hasEarlier: true,
        records: [buildMockLogRecord({ kind: 'task.step_started', sequence: 90 })],
      },
      thread: 'p7hd2wq9zn',
    }),
  );

  await waitFor(() => {
    expect(hook.result.current.isFailed).toBe(true);
  });

  act(() => {
    hook.result.current.onRetry();
  });

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.taskMessage?.messageID)).toContain(
      'm7q2x9k4pa',
    );
  });

  expect(hook.result.current.isFailed).toBe(false);

  expect(bodies.mock.calls.map(([body]) => body)).toStrictEqual([
    { json: { beforeSequence: 90, thread: 'p7hd2wq9zn' } },
    { json: { beforeSequence: 40, thread: 'p7hd2wq9zn' } },
    { json: { beforeSequence: 40, thread: 'p7hd2wq9zn' } },
  ]);
});

test('it reads the first earlier page again on a retry after it fails, and finds the linked message', async () => {
  await createDeviceSession();

  await store.records.create({
    kind: 'task_message',
    taskMessage: { from: 'k3vq8m2xpa', fromName: 'Garden plan', messageID: 'm7q2x9k4pa' },
    thread: 'p7hd2wq9zn',
  });

  const later = await Promise.all(
    Array.from({ length: 30 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  const oldestShown = later.toSorted((left, right) => left.sequence - right.sequence).at(20);

  if (oldestShown === undefined) {
    throw new Error('the thread holds 30 later records');
  }

  server.use(http.post('*/rpc/conversation/read', () => HttpResponse.error(), { once: true }));

  const hook = renderHook(() =>
    useEarlierRecords({
      messageID: 'm7q2x9k4pa',
      page: {
        hasEarlier: true,
        records: [
          buildMockLogRecord({ kind: 'task.step_started', sequence: oldestShown.sequence }),
        ],
      },
      thread: 'p7hd2wq9zn',
    }),
  );

  await waitFor(() => {
    expect(hook.result.current.isFailed).toBe(true);
  });

  act(() => {
    hook.result.current.onRetry();
  });

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.taskMessage?.messageID)).toContain(
      'm7q2x9k4pa',
    );
  });

  expect(hook.result.current.isFailed).toBe(false);
});

test('it stops at the linked message and leaves the older pages of the thread unread', async () => {
  const reads = mock<() => void>();

  await createDeviceSession();

  server.use(
    http.post('*/rpc/conversation/read', () => {
      reads();
    }),
  );

  await Promise.all(
    Array.from({ length: 100 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  await store.records.create({
    kind: 'task_message',
    taskMessage: { from: 'k3vq8m2xpa', fromName: 'Garden plan', messageID: 'm7q2x9k4pa' },
    thread: 'p7hd2wq9zn',
  });

  const later = await Promise.all(
    Array.from({ length: 80 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  const oldestShown = later.toSorted((left, right) => left.sequence - right.sequence).at(70);

  if (oldestShown === undefined) {
    throw new Error('the thread holds 80 later records');
  }

  const hook = renderHook(() =>
    useEarlierRecords({
      messageID: 'm7q2x9k4pa',
      page: {
        hasEarlier: true,
        records: [
          buildMockLogRecord({ kind: 'task.step_started', sequence: oldestShown.sequence }),
        ],
      },
      thread: 'p7hd2wq9zn',
    }),
  );

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.taskMessage?.messageID)).toContain(
      'm7q2x9k4pa',
    );
  });

  hook.rerender();

  await buildBrowserClient().conversation.read({ thread: 'p7hd2wq9zn' });

  expect(reads).toHaveBeenCalledTimes(3);
});

test('it reads no further pages once the link goes, though the view stays', async () => {
  const reads = mock<() => void>();
  const link: { messageID: string | undefined } = { messageID: 'm7q2x9k4pa' };

  await createDeviceSession();

  server.use(
    http.post('*/rpc/conversation/read', () => {
      reads();
    }),
  );

  await Promise.all(
    Array.from({ length: 100 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  await store.records.create({
    kind: 'task_message',
    taskMessage: { from: 'k3vq8m2xpa', fromName: 'Garden plan', messageID: 'm7q2x9k4pa' },
    thread: 'p7hd2wq9zn',
  });

  const later = await Promise.all(
    Array.from({ length: 80 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  const oldestShown = later.toSorted((left, right) => left.sequence - right.sequence).at(70);

  if (oldestShown === undefined) {
    throw new Error('the thread holds 80 later records');
  }

  const hook = renderHook(() =>
    useEarlierRecords({
      messageID: link.messageID,
      page: {
        hasEarlier: true,
        records: [
          buildMockLogRecord({ kind: 'task.step_started', sequence: oldestShown.sequence }),
        ],
      },
      thread: 'p7hd2wq9zn',
    }),
  );

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.taskMessage?.messageID)).toContain(
      'm7q2x9k4pa',
    );
  });

  link.messageID = undefined;

  hook.rerender();

  await buildBrowserClient().conversation.read({ thread: 'p7hd2wq9zn' });

  expect(reads).toHaveBeenCalledTimes(3);
});
