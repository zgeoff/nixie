import { expect, test } from 'bun:test';
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
      imp_host: () => Promise.resolve({ isReady: true, reason: null }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
  });

  const response = await app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: true, reason: null },
      imp_host: { isReady: true, reason: null },
      conversation_imp: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
  });
});

test('it answers readiness with 503 while one part is unready', async () => {
  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    readiness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      definitions: () => Promise.resolve({ isReady: true, reason: null }),
      imp_host: () => Promise.resolve({ isReady: false, reason: 'impd does not answer' }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
  });

  const response = await app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(503);
  expect(body).toMatchObject({
    status: 'unready',
    parts: { imp_host: { isReady: false, reason: 'impd does not answer' } },
  });
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
      imp_host: () => Promise.resolve({ isReady: true, reason: null }),
      conversation_imp: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
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
