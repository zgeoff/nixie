import { expect, test } from 'bun:test';
import { makeCodeRunSlots } from './make-code-run-slots';

test('it refuses a take once every slot is taken, and gives one back on release', () => {
  const slots = makeCodeRunSlots(2);
  const takes = [slots.take(), slots.take(), slots.take()];

  slots.release();

  expect(takes).toStrictEqual([true, true, false]);
  expect(slots.take()).toBe(true);
});
