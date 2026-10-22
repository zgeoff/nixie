import { expect, test } from 'bun:test';
import { waitAtFaultPoint } from '@heynixie/tasks';
import { startFaultPointFailure } from './start-fault-point-failure';

test('it throws at the first arrival at the fault point', () => {
  startFaultPointFailure('memory.forget.key_removed');

  expect(
    waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-1' }),
  ).rejects.toThrowWithMessage(Error, 'crashed at memory.forget.key_removed');
});

test('it lets a later arrival at the fault point through', async () => {
  startFaultPointFailure('memory.forget.key_removed');

  const first = waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-1' });

  await first.catch(() => {});

  await expect(
    waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-1' }),
  ).toResolve();
});

test('it lets an arrival for another ID through, and throws at the first one for the ID it names', async () => {
  startFaultPointFailure('memory.forget.key_removed', 'item-2');

  await expect(
    waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-1' }),
  ).toResolve();

  expect(
    waitAtFaultPoint('memory.forget.key_removed', { kind: 'memory', id: 'item-2' }),
  ).rejects.toThrowWithMessage(Error, 'crashed at memory.forget.key_removed');
});

test('it lets another fault point through', async () => {
  startFaultPointFailure('memory.forget.key_removed');

  await expect(waitAtFaultPoint('memory.recall.ranked', { kind: 'memory', id: null })).toResolve();
});
