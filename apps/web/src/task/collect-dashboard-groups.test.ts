import { expect, test } from 'bun:test';
import { buildMockListedTask } from '../test-utils/build-mock-listed-task';
import { collectDashboardGroups } from './collect-dashboard-groups';

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

test.each([
  ['idle', 'working'],
  ['asleep', 'working'],
  ['finished', 'working'],
  ['paused', 'held'],
  ['stopped', 'held'],
  ['failed', 'held'],
] as const)('it puts a task listed %s in %s', (listedState, group) => {
  const task = buildMockListedTask({ listedState, state: 'waiting', taskID: 'k3vq8m2xpa' });

  expect(collectDashboardGroups([task])[group]).toStrictEqual([task]);
});

test('it leaves out a task listed done or closed', () => {
  const done = buildMockListedTask({ listedState: 'done', state: 'done' });
  const closed = buildMockListedTask({ listedState: 'closed', state: 'closed' });

  expect(collectDashboardGroups([done, closed])).toStrictEqual({
    conversation: undefined,
    held: [],
    working: [],
  });
});

test('it groups a task with no listed state by its stored state', () => {
  const task = buildMockListedTask({ state: 'paused' });

  expect(collectDashboardGroups([task]).held).toStrictEqual([task]);
});

test('it keeps the conversation in its own group while nixie holds it paused', () => {
  const conversation = buildMockListedTask({
    listedState: 'paused',
    state: 'waiting',
    taskID: 'conversation',
  });

  expect(collectDashboardGroups([conversation])).toStrictEqual({
    conversation,
    held: [],
    working: [],
  });
});
