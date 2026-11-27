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
    collectDashboardGroups([running, conversation, paused, done, waiting, closed, failed], true),
  ).toStrictEqual({
    conversation,
    held: [paused, failed],
    supervised: [],
    working: [running, waiting],
  });
});

test('it gives no conversation when the list does not hold it', () => {
  expect(collectDashboardGroups([], true)).toStrictEqual({
    conversation: undefined,
    held: [],
    supervised: [],
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

  expect(collectDashboardGroups([task], true)[group]).toStrictEqual([task]);
});

test('it leaves out a task listed done or closed', () => {
  const done = buildMockListedTask({ listedState: 'done', state: 'done' });
  const closed = buildMockListedTask({ listedState: 'closed', state: 'closed' });

  expect(collectDashboardGroups([done, closed], true)).toStrictEqual({
    conversation: undefined,
    held: [],
    supervised: [],
    working: [],
  });
});

test('it groups a task with no listed state by its stored state', () => {
  const task = buildMockListedTask({ state: 'paused' });

  expect(collectDashboardGroups([task], true).held).toStrictEqual([task]);
});

test('it keeps the conversation in its own group while nixie holds it paused', () => {
  const conversation = buildMockListedTask({
    listedState: 'paused',
    state: 'waiting',
    taskID: 'conversation',
  });

  expect(collectDashboardGroups([conversation], true)).toStrictEqual({
    conversation,
    held: [],
    supervised: [],
    working: [],
  });
});

test.each(['running', 'waiting', 'paused', 'stopped', 'failed', 'done'] as const)(
  'it puts a task that supervises a session in the coding group, whatever its state %s',
  (listedState) => {
    const supervised = buildMockListedTask({
      listedState,
      session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'running' },
      state: 'waiting',
      taskID: 'k3vq8m2xpa',
    });

    expect(collectDashboardGroups([supervised], true)).toStrictEqual({
      conversation: undefined,
      held: [],
      supervised: [supervised],
      working: [],
    });
  },
);

test('it groups a task that supervises a session with the working tasks while coding is off', () => {
  const supervised = buildMockListedTask({
    listedState: 'waiting',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'running' },
    taskID: 'k3vq8m2xpa',
  });

  expect(collectDashboardGroups([supervised], false)).toStrictEqual({
    conversation: undefined,
    held: [],
    supervised: [],
    working: [supervised],
  });
});

test('it keeps a finished task in the coding group, with the ended state of its session', () => {
  const finished = buildMockListedTask({
    listedState: 'done',
    session: { isReleased: false, lastEventAt: null, origin: 'started', state: 'ended' },
    state: 'done',
    taskID: 'k3vq8m2xpa',
  });

  expect(collectDashboardGroups([finished], true).supervised).toStrictEqual([finished]);
});

test('it leaves out a closed task that supervised a session', () => {
  const closed = buildMockListedTask({
    listedState: 'closed',
    session: { isReleased: true, lastEventAt: null, origin: 'started', state: 'ended' },
    state: 'closed',
    taskID: 'k3vq8m2xpa',
  });

  expect(collectDashboardGroups([closed], true).supervised).toStrictEqual([]);
});

test('it puts a task that joined a session in the coding group, as the one that nixie started', () => {
  const joined = buildMockListedTask({
    listedState: 'waiting',
    session: { isReleased: false, lastEventAt: null, origin: 'joined', state: 'idle' },
    taskID: 'k3vq8m2xpa',
  });

  expect(collectDashboardGroups([joined], true).supervised).toStrictEqual([joined]);
});
