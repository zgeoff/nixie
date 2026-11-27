import { expect, test } from 'bun:test';
import { waitAtFaultPoint } from '../lease/wait-at-fault-point';
import { startFaultPointFailure } from './start-fault-point-failure';

test('it throws at the first arrival at the fault point', () => {
  startFaultPointFailure('memory.lapse.read');

  expect(
    waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-1' }),
  ).rejects.toThrowWithMessage(Error, 'crashed at memory.lapse.read');
});

test('it lets a later arrival at the fault point through', async () => {
  startFaultPointFailure('memory.lapse.read');

  const first = waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-1' });

  await first.catch(() => {});

  await expect(waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-1' })).toResolve();
});

test('it lets an arrival for another ID through, and throws at the first one for the ID it names', async () => {
  startFaultPointFailure('memory.lapse.read', 'item-2');

  await expect(waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-1' })).toResolve();

  expect(
    waitAtFaultPoint('memory.lapse.read', { kind: 'memory', id: 'item-2' }),
  ).rejects.toThrowWithMessage(Error, 'crashed at memory.lapse.read');
});

test('it lets another fault point through', async () => {
  startFaultPointFailure('memory.lapse.read');

  await expect(waitAtFaultPoint('memory.recall.ranked', { kind: 'memory', id: null })).toResolve();
});
