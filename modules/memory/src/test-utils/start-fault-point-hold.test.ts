import { expect, test } from 'bun:test';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { startFaultPointHold } from './start-fault-point-hold';

test('it holds the first arrival at the fault point until the release', async () => {
  const hold = startFaultPointHold('memory.lapse.read');
  const first = waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-1' });

  const context = await hold.reached;

  const statusBeforeRelease = Bun.peek.status(first);

  hold.release();

  expect(context).toStrictEqual({ kind: 'memory', id: 'item-1' });
  expect(statusBeforeRelease).toBe('pending');

  await expect(first).toResolve();
});

test('it lets a later arrival at the held fault point through', async () => {
  const hold = startFaultPointHold('memory.lapse.read');

  void waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-1' });

  await hold.reached;

  await expect(waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-1' })).toResolve();
});

test('it lets another fault point through', async () => {
  startFaultPointHold('memory.lapse.read');

  await expect(waitAtFaultPoint('memory.recall.ranked', { kind: 'memory', id: null })).toResolve();
});
