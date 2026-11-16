import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { makeWorkerSlots } from './make-worker-slots';

test('it grants every call a slot when no cap is set', async () => {
  const slots = makeWorkerSlots(undefined);

  const signal = new AbortController().signal;

  const grants = await Promise.all([slots.acquire(signal), slots.acquire(signal)]);

  expect(grants.map((grant) => grant.kind)).toStrictEqual(['granted', 'granted']);
});

test('it answers full at once under a cap that errors', async () => {
  const slots = makeWorkerSlots({ max: 1, whenFull: 'error' });

  const signal = new AbortController().signal;

  await slots.acquire(signal);

  const second = await slots.acquire(signal);

  expect(second).toStrictEqual({ kind: 'full', max: 1 });
});

test('it grants a waiting call its slot, in the order the calls came, when a slot frees', async () => {
  const slots = makeWorkerSlots({ max: 1, whenFull: 'wait' });

  const signal = new AbortController().signal;

  const first = await slots.acquire(signal);

  invariant(first.kind === 'granted', 'the first call got a slot');

  const order: string[] = [];

  const take = async (name: string): Promise<void> => {
    await slots.acquire(signal);

    order.push(name);
  };

  const second = take('second');

  void take('third');
  first.release();

  await second;

  expect(order).toStrictEqual(['second']);
});

test('it frees a slot once, though its release runs twice', async () => {
  const slots = makeWorkerSlots({ max: 1, whenFull: 'error' });

  const signal = new AbortController().signal;

  const first = await slots.acquire(signal);

  invariant(first.kind === 'granted', 'the first call got a slot');

  first.release();
  first.release();

  const second = await slots.acquire(signal);
  const third = await slots.acquire(signal);

  expect([second.kind, third.kind]).toStrictEqual(['granted', 'full']);
});

test("it rejects a waiting call with the signal's reason when the signal aborts first", async () => {
  const slots = makeWorkerSlots({ max: 1, whenFull: 'wait' });

  const controller = new AbortController();

  await slots.acquire(controller.signal);

  const waiting = slots.acquire(controller.signal);

  controller.abort(new Error('the step ended'));

  expect(waiting).rejects.toThrowWithMessage(Error, 'the step ended');
});
