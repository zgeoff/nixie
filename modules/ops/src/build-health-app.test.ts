import { expect, mock, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { buildHealthApp } from './build-health-app';

test('it answers readiness with 200 and every part when all are ready', async () => {
  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      definitions: () => Promise.resolve({ isReady: true, reason: null }),
    },
    dependencies: {
      imp_host: () => Promise.resolve({ isReady: true, reason: null }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    advisory: {
      conversation_turns: () => Promise.resolve({ isReady: true, reason: null }),
    },
    log: () => {},
  });

  const response = await app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: true, reason: null },
    },
    dependencies: {
      imp_host: { isReady: true, reason: null },
      conversation_imp: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
    advisory: {
      conversation_turns: { isReady: true, reason: null },
    },
  });
});

test('it answers readiness with 200 while an advisory part fails, with that part in the body', async () => {
  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      definitions: () => Promise.resolve({ isReady: true, reason: null }),
    },
    dependencies: {
      imp_host: () => Promise.resolve({ isReady: true, reason: null }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    advisory: {
      conversation_turns: () =>
        Promise.resolve({ isReady: false, reason: 'the last 3 turns failed' }),
    },
    log: () => {},
  });

  const response = await app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(200);

  expect(body).toMatchObject({
    status: 'ready',
    advisory: { conversation_turns: { isReady: false, reason: 'the last 3 turns failed' } },
  });
});

test('it answers readiness with 200 and the status degraded while a dependency check times out', async () => {
  const clock = buildTestClock(0);

  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      definitions: () => Promise.resolve({ isReady: true, reason: null }),
    },
    dependencies: {
      imp_host: () => Promise.withResolvers<never>().promise,
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    advisory: {
      conversation_turns: () => Promise.resolve({ isReady: true, reason: null }),
    },
    timeoutMs: 2000,
    clock,
    log: () => {},
  });

  const pending = app.handle(new Request('http://nixie/health/ready'));

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(2000);

  const response = await pending;
  const body = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    status: 'degraded',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: true, reason: null },
    },
    dependencies: {
      imp_host: { isReady: false, reason: 'the check took longer than 2000 ms' },
      conversation_imp: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
    advisory: {
      conversation_turns: { isReady: true, reason: null },
    },
  });
});

test('it answers readiness with 503 while a readiness part is unready', async () => {
  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: false, reason: 'the migrations have not run' }),
      definitions: () => Promise.resolve({ isReady: true, reason: null }),
    },
    dependencies: {
      imp_host: () => Promise.resolve({ isReady: true, reason: null }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    advisory: {
      conversation_turns: () => Promise.resolve({ isReady: true, reason: null }),
    },
    log: () => {},
  });

  const response = await app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(503);

  expect(body).toMatchObject({
    status: 'unready',
    parts: { database: { isReady: false, reason: 'the migrations have not run' } },
  });
});

test('it answers readiness with 503 and not degraded while a readiness part and a dependency part both fail', async () => {
  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      definitions: () => Promise.resolve({ isReady: false, reason: 'no seed has applied yet' }),
    },
    dependencies: {
      imp_host: () => Promise.resolve({ isReady: false, reason: 'impd does not answer' }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    advisory: {
      conversation_turns: () => Promise.resolve({ isReady: true, reason: null }),
    },
    log: () => {},
  });

  const response = await app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(503);
  expect(body).toMatchObject({ status: 'unready' });
});

test('it answers liveness per part, apart from readiness', async () => {
  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.reject(new Error('the database is closed')),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      definitions: () => Promise.resolve({ isReady: true, reason: null }),
    },
    dependencies: {
      imp_host: () => Promise.resolve({ isReady: true, reason: null }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    advisory: {
      conversation_turns: () =>
        Promise.resolve({ isReady: false, reason: 'the last 3 turns failed' }),
    },
    log: () => {},
  });

  const response = await app.handle(new Request('http://nixie/health/live'));
  const body = await response.json();

  expect(response.status).toBe(503);

  expect(body).toStrictEqual({
    status: 'unready',
    parts: {
      process: { isReady: true, reason: null },
      database: { isReady: false, reason: 'the check failed: Error' },
    },
  });
});

test('it logs the name and reason of a dependency part that turns unready', async () => {
  const log = mock();

  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      definitions: () => Promise.resolve({ isReady: true, reason: null }),
    },
    dependencies: {
      imp_host: () => Promise.resolve({ isReady: true, reason: null }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: false, reason: 'the data volume is 93% full' }),
    },
    advisory: {
      conversation_turns: () => Promise.resolve({ isReady: true, reason: null }),
    },
    log,
  });

  await app.handle(new Request('http://nixie/health/ready'));

  expect(log).toHaveBeenCalledExactlyOnceWith(
    'health.part_unready',
    { probe: 'ready', part: 'disk', reason: 'the data volume is 93% full' },
    'warn',
  );
});
