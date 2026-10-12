import { expect, test } from 'bun:test';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { startFaultPointHold } from './start-fault-point-hold';

test('it holds the first arrival at the fault point until the release', async () => {
  const hold = startFaultPointHold('memory.forget.key_removed');
  const first = waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-1' });

  const context = await hold.reached;
  const statusBeforeRelease = Bun.peek.status(first);

  hold.release();

  expect(context).toStrictEqual({ kind: 'memory', id: 'item-1' });
  expect(statusBeforeRelease).toBe('pending');
  await expect(first).toResolve();
});

test('it lets a later arrival at the held fault point through', async () => {
  const hold = startFaultPointHold('memory.forget.key_removed');

  void waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-1' });
  await hold.reached;

  await expect(
    waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-1' }),
  ).toResolve();
});

test('it lets another fault point through', async () => {
  startFaultPointHold('memory.forget.key_removed');

  await expect(waitAtFaultPoint('memory.recall.ranked', { kind: 'memory', id: null })).toResolve();
});
