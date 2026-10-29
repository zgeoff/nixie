import { expect, test } from 'bun:test';
import { collectMessageRoutes } from './collect-message-routes';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';

test('it gives each routed message the task its newest route or move names', () => {
  const routes = collectMessageRoutes([
    buildMockLogRecord({
      kind: 'task.route_corrected',
      route: { isMove: true, messages: [4], taskID: 'conversation' },
      sequence: 9,
    }),
    buildMockLogRecord({
      kind: 'task.routed',
      route: { isMove: false, messages: [4, 5], taskID: 'k3x9m2p7qa' },
      sequence: 6,
    }),
    buildMockLogRecord({
      kind: 'owner_message',
      message: { text: 'Book the ferry.' },
      sequence: 4,
    }),
  ]);

  expect([...routes]).toStrictEqual([
    [4, { taskID: 'conversation', isMove: true }],
    [5, { taskID: 'k3x9m2p7qa', isMove: false }],
  ]);
});

test('it gives no route to a message that went nowhere', () => {
  expect(
    collectMessageRoutes([
      buildMockLogRecord({ kind: 'owner_message', message: { text: 'Hello.' }, sequence: 4 }),
    ]).size,
  ).toBe(0);
});
