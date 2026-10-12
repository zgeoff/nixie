import { expect, test } from 'bun:test';
import { makeSessionGuard } from './make-session-guard';

test('it runs a second turn while the first still runs', async () => {
  const guard = makeSessionGuard();
  const order: string[] = [];
  const held = Promise.withResolvers<void>();
  const first = guard.withTurn(async () => {
    order.push('first started');
    await held.promise;
    order.push('first ended');
  });
  const second = guard.withTurn(() => {
    order.push('second ran');
    held.resolve();
    return Promise.resolve();
  });

  await Promise.all([first, second]);

  expect(order).toStrictEqual(['first started', 'second ran', 'first ended']);
});

test('it aborts every running turn and runs the cleanup once they ended, before a later turn', async () => {
  const guard = makeSessionGuard();
  const order: string[] = [];
  const started = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const turns = started.map((gate, index) =>
    guard.withTurn(async (signal) => {
      const aborted = Promise.withResolvers<void>();

      signal.addEventListener('abort', () => {
        aborted.resolve();
      });
      gate.resolve();
      await aborted.promise;
      order.push(`turn ${index} aborted`);
    }),
  );

  await Promise.all(started.map((gate) => gate.promise));

  const cleanup = guard.withInvalidation(() => {
    order.push('cleanup');
    return Promise.resolve();
  });
  const later = guard.withTurn((signal) => {
    order.push(`later turn, aborted: ${signal.aborted}`);
    return Promise.resolve();
  });

  await Promise.all([...turns, cleanup, later]);

  expect(order).toStrictEqual([
    'turn 0 aborted',
    'turn 1 aborted',
    'cleanup',
    'later turn, aborted: false',
  ]);
});

test('it aborts a turn that was still starting when the cleanup was asked for', async () => {
  const guard = makeSessionGuard();
  const order: string[] = [];
  const turn = guard.withTurn(async (signal) => {
    const aborted = Promise.withResolvers<void>();

    signal.addEventListener('abort', () => {
      aborted.resolve();
    });
    order.push('turn started');
    await aborted.promise;
    order.push('turn aborted');
  });

  await Promise.resolve();

  const cleanup = guard.withInvalidation(() => {
    order.push('cleanup');
    return Promise.resolve();
  });

  await Promise.all([turn, cleanup]);

  expect(order).toStrictEqual(['turn started', 'turn aborted', 'cleanup']);
});

test('it holds a turn until a cleanup asked for during an earlier cleanup is done', async () => {
  const guard = makeSessionGuard();
  const order: string[] = [];
  const held = Promise.withResolvers<void>();
  const first = guard.withInvalidation(async () => {
    await held.promise;
    order.push('first cleanup');
  });
  const turn = guard.withTurn(() => {
    order.push('turn');
    return Promise.resolve();
  });
  const second = guard.withInvalidation(() => {
    order.push('second cleanup');
    return Promise.resolve();
  });

  held.resolve();
  await Promise.all([first, turn, second]);

  expect(order).toStrictEqual(['first cleanup', 'second cleanup', 'turn']);
});

test('it runs a cleanup at once when no turn runs', async () => {
  const guard = makeSessionGuard();
  const ran: string[] = [];

  await guard.withInvalidation(() => {
    ran.push('cleanup');
    return Promise.resolve();
  });

  expect(ran).toStrictEqual(['cleanup']);
});

test('it runs the next turn after a cleanup that failed', async () => {
  const guard = makeSessionGuard();
  const failed = guard.withInvalidation(() => Promise.reject(new Error('the guest exited')));

  await failed.catch(() => {});

  const next = await guard.withTurn(() => Promise.resolve('ran'));

  expect(failed).rejects.toThrow('the guest exited');
  expect(next).toBe('ran');
});
