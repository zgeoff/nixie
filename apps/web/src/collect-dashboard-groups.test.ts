import { expect, test } from 'bun:test';
import { collectDashboardGroups } from './collect-dashboard-groups';
import { buildMockListedTask } from './test-utils/build-mock-listed-task';

test('it puts the conversation first, then the working and the held tasks, and leaves out finished ones', () => {
  const conversation = buildMockListedTask({ state: 'waiting', taskID: 'conversation' });
  const running = buildMockListedTask({ state: 'running', taskID: 'k3vq8m2xpa' });
  const waiting = buildMockListedTask({ state: 'waiting', taskID: 'p7hd2wq9zn' });
  const paused = buildMockListedTask({ state: 'paused', taskID: 'r5bn1cy6tf' });
  const failed = buildMockListedTask({ state: 'failed', taskID: 'w2jk7nd4hs' });
  const done = buildMockListedTask({ state: 'done', taskID: 'h8tq3ze5vm' });
  const closed = buildMockListedTask({ state: 'closed', taskID: 'b6fy4kc2xn' });

  expect(
    collectDashboardGroups([running, conversation, paused, done, waiting, closed, failed]),
  ).toStrictEqual({ conversation, held: [paused, failed], working: [running, waiting] });
});

test('it gives no conversation when the list does not hold it', () => {
  expect(collectDashboardGroups([])).toStrictEqual({
    conversation: undefined,
    held: [],
    working: [],
  });
});
