import { expect, test } from 'bun:test';
import { makeReadErasureStuckPort } from './make-read-erasure-stuck-port';

test('it reads no port before the runner starts', () => {
  const readPort = makeReadErasureStuckPort(() => null, { nowMs: () => 1000, stuckAfterMs: 500 });

  expect(readPort()).toBeNull();
});

test('it reads a port that asks the runner for the stuck forgets once it starts', async () => {
  const readPort = makeReadErasureStuckPort(
    () => ({
      readStuck: (query) =>
        Promise.resolve([
          { erasureID: 'e1', kind: 'note', shortID: 'n1', openForMs: query.nowMs - 400 },
        ]),
      retryStuck: () => Promise.resolve({ stillOpen: [], failures: [] }),
    }),
    { nowMs: () => 1000, stuckAfterMs: 500 },
  );

  const stuck = await readPort()?.readStuck();

  expect(stuck).toStrictEqual([{ kind: 'note', shortID: 'n1', openForMs: 600 }]);
});
