import { expect, test } from 'bun:test';
import { hostContract } from './host-contract';

test('it accepts a raise of the turns alone', () => {
  const payload = { taskID: 'k3x9m2p7qa', turns: 40 };

  expect(hostContract.tasks.raise['~orpc'].inputSchema?.safeParse(payload).data).toStrictEqual(
    payload,
  );
});

test('it refuses a raise that sets neither turns nor dollars', () => {
  expect(
    hostContract.tasks.raise['~orpc'].inputSchema?.safeParse({ taskID: 'k3x9m2p7qa' }).error
      ?.issues,
  ).toPartiallyContain({ message: 'a raise sets turns, dollars or both' });
});

test.each([
  ['a fractional turn count', { turns: 40.5 }, 'turns'],
  ['a turn count of 0', { turns: 0 }, 'turns'],
  ['a negative turn count', { turns: -3 }, 'turns'],
  ['a dollar amount of 0', { dollars: 0 }, 'dollars'],
  ['a negative dollar amount', { dollars: -1.5 }, 'dollars'],
])('it refuses a raise with %s', (_case, limits, field) => {
  expect(
    hostContract.tasks.raise['~orpc'].inputSchema?.safeParse({ taskID: 'k3x9m2p7qa', ...limits })
      .error?.issues,
  ).toPartiallyContain({ path: [field] });
});
