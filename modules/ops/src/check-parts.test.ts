import { expect, test } from 'bun:test';
import { checkParts } from './check-parts';

test('it reports ready when every part is ready', async () => {
  const report = await checkParts(
    {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    1000,
  );

  expect(report).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
  });
});

test('it reports unready when one part is unready, and names its reason', async () => {
  const report = await checkParts(
    {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: false, reason: 'the data volume is 95% full' }),
    },
    1000,
  );

  expect(report).toStrictEqual({
    status: 'unready',
    parts: {
      database: { isReady: true, reason: null },
      disk: { isReady: false, reason: 'the data volume is 95% full' },
    },
  });
});

test('it reports a check that throws as unready with the error name alone', async () => {
  const report = await checkParts(
    { database: () => Promise.reject(new TypeError('the text of a message')) },
    1000,
  );

  expect(report.parts['database']).toStrictEqual({
    isReady: false,
    reason: 'the check failed: TypeError',
  });
});

test('it reports a check that never settles as unready once the timeout passes', async () => {
  const report = await checkParts({ imp_host: () => Promise.withResolvers<never>().promise }, 20);

  expect(report.parts['imp_host']).toStrictEqual({
    isReady: false,
    reason: 'the check took longer than 20 ms',
  });
});
