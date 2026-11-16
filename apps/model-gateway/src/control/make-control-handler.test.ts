import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { writeOverride } from '../override/write-override';
import { createPeriodStore } from '../periods/create-period-store';
import { makeControlHandler } from './make-control-handler';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-control-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  let current = Date.parse('2026-11-13T16:42:07Z');
  const now = () => current;

  const store = await createPeriodStore({
    path: join(directory, 'store.json'),
    zone: 'Europe/London',
    now,
  });

  const overridePath = join(directory, 'override.json');

  const handler = makeControlHandler({
    store,
    token: 'secret-control-token',
    now,
    log: mock<Logger>(() => {}),
    config: {
      zone: 'Europe/London',
      caps: {
        day: { dollars: 120, tokens: 160_000_000 },
        month: { dollars: 1200, tokens: 1_200_000_000 },
      },
      control: { listen: { hostname: '127.0.0.1', port: 0 }, tokenFile: join(directory, 'token') },
      countBySandbox: true,
      override: overridePath,
    },
  });

  return {
    store,
    overridePath,
    limits: {
      day: { dollars: 60, tokens: 80_000_000 },
      month: { dollars: 600, tokens: 600_000_000 },
    },
    moveTo: (instant: string) => {
      current = Date.parse(instant);
    },
    call: async (
      method: string,
      path: string,
      body?: unknown,
      authorization = `Bearer secret-control-token`,
    ) => {
      const response = await handler(
        new Request(`http://control.test${path}`, {
          method,
          headers: { authorization },
          body: body === undefined ? null : JSON.stringify(body),
        }),
      );

      const text = await response.text();

      const parsed: unknown = text === '' ? null : JSON.parse(text);

      return { status: response.status, body: parsed };
    },
  };
}

test.each([
  ['GET', '/status'],
  ['PUT', '/limits'],
  ['POST', '/raise'],
  ['PUT', '/sandboxes/alpha'],
  ['GET', '/sandboxes/alpha'],
  ['DELETE', '/sandboxes/alpha'],
  ['GET', '/anything-else'],
])('it answers %s %s with a 401 and no change when the token is wrong', async (method, path) => {
  const ctx = await setupTest();
  const response = await ctx.call(method, path, ctx.limits, 'Bearer not-the-token');
  const held = await ctx.store.read();

  expect(response.status).toBe(401);
  expect(held.periods.day.limit).toBeNull();
});

test('it answers a request with no authorization header with a 401', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('GET', '/status', undefined, '');

  expect(response.status).toBe(401);
});

test('it reports the status of a gateway whose limits are not set yet', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('GET', '/status');

  expect(response).toStrictEqual({
    status: 200,
    body: {
      zone: 'Europe/London',
      lost: false,
      periods: {
        day: {
          start: '2026-11-13',
          resetsAt: '2026-11-14T00:00:00Z',
          spent: { dollars: 0, tokens: 0 },
          limit: null,
          cap: { dollars: 120, tokens: 160_000_000 },
        },
        month: {
          start: '2026-11-01',
          resetsAt: '2026-12-01T00:00:00Z',
          spent: { dollars: 0, tokens: 0 },
          limit: null,
          cap: { dollars: 1200, tokens: 1_200_000_000 },
        },
      },
      tripped: null,
    },
  });
});

test('it sets the limits of both periods and answers with the status', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('PUT', '/limits', ctx.limits);

  expect(response).toMatchObject({
    status: 200,
    body: { periods: { day: { limit: ctx.limits.day }, month: { limit: ctx.limits.month } } },
  });
});

test('it accepts limits that equal the caps', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('PUT', '/limits', {
    day: { dollars: 120, tokens: 160_000_000 },
    month: { dollars: 1200, tokens: 1_200_000_000 },
  });

  expect(response.status).toBe(200);
});

test('it refuses limits past the day cap with a 409 and changes nothing', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);

  const response = await ctx.call('PUT', '/limits', {
    day: { dollars: 120.01, tokens: 80_000_000 },
    month: { dollars: 700, tokens: 600_000_000 },
  });

  const held = await ctx.store.read();

  expect(response).toStrictEqual({
    status: 409,
    body: { error: 'above_cap', period: 'day', cap: { dollars: 120, tokens: 160_000_000 } },
  });

  expect([held.periods.day.limit, held.periods.month.limit]).toStrictEqual([
    ctx.limits.day,
    ctx.limits.month,
  ]);
});

test('it refuses a month token limit past the month cap with a 409', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('PUT', '/limits', {
    day: ctx.limits.day,
    month: { dollars: 600, tokens: 1_200_000_001 },
  });

  expect(response).toMatchObject({ status: 409, body: { error: 'above_cap', period: 'month' } });
});

test.each([
  ['a body that is not JSON', 'not json'],
  ['a body with no month', { day: { dollars: 60, tokens: 80_000_000 } }],
  [
    'a limit of zero',
    { day: { dollars: 0, tokens: 1 }, month: { dollars: 600, tokens: 600_000_000 } },
  ],
  [
    'an unknown field',
    {
      day: { dollars: 60, tokens: 80_000_000 },
      month: { dollars: 600, tokens: 600_000_000 },
      week: { dollars: 1, tokens: 1 },
    },
  ],
])('it refuses %s for the limits with a 400', async (_name, body) => {
  const ctx = await setupTest();
  const response = await ctx.call('PUT', '/limits', body);

  expect(response.status).toBe(400);
});

test('it raises the day for the day in force and reports the raise as the limit', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);

  const response = await ctx.call('POST', '/raise', {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 90, tokens: 120_000_000 },
  });

  expect(response).toMatchObject({
    status: 200,
    body: { periods: { day: { limit: { dollars: 90, tokens: 120_000_000 } } } },
  });
});

test('it refuses a raise past the cap with a 409 and keeps the limit', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);

  const response = await ctx.call('POST', '/raise', {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 90, tokens: 160_000_001 },
  });

  const held = await ctx.store.read();

  expect(response).toStrictEqual({
    status: 409,
    body: { error: 'above_cap', period: 'day', cap: { dollars: 120, tokens: 160_000_000 } },
  });

  expect(held.periods.day.raise).toBeNull();
});

test('it refuses a raise for a day that is not the one in force with a 409', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);

  const response = await ctx.call('POST', '/raise', {
    period: 'day',
    start: '2026-11-12',
    limit: { dollars: 90, tokens: 120_000_000 },
  });

  const held = await ctx.store.read();

  expect(response).toStrictEqual({ status: 409, body: { error: 'period_ended' } });
  expect(held.periods.day.raise).toBeNull();
});

test('it refuses a raise of the day that names a day that ended at midnight', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);

  ctx.moveTo('2026-11-14T00:00:00Z');

  const response = await ctx.call('POST', '/raise', {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 90, tokens: 120_000_000 },
  });

  expect(response).toStrictEqual({ status: 409, body: { error: 'period_ended' } });
});

test('it refuses a raise of the month with a 400', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    period: 'month',
    start: '2026-11-01',
    limit: { dollars: 900, tokens: 900_000_000 },
  });

  expect(response.status).toBe(400);
});

test('it reports a trip once the day count reaches its limit', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);
  await ctx.store.addSpend(null, { dollars: 61.2, tokens: 51_200_000 });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    tripped: { period: 'day', measure: 'dollars', at: '2026-11-13T16:42:07Z' },
    periods: { day: { spent: { dollars: 61.2, tokens: 51_200_000 } } },
  });
});

test('it clears a trip once a raise lifts the limit above the count', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);
  await ctx.store.addSpend(null, { dollars: 61.2, tokens: 1 });

  await ctx.call('POST', '/raise', {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 90, tokens: 120_000_000 },
  });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({ tripped: null });
});

test('it reports a trip that no longer holds once midnight has reset the day', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);
  await ctx.store.addSpend(null, { dollars: 61.2, tokens: 1 });

  ctx.moveTo('2026-11-14T00:00:00Z');

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    tripped: null,
    periods: { day: { start: '2026-11-14', spent: { dollars: 0 } } },
  });
});

test('it reports the lost mark as a trip', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);
  await ctx.store.markLost();

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    lost: true,
    tripped: { lost: true, at: '2026-11-13T16:42:07Z' },
  });
});

test('it reports the override as the limit in force while it applies to the day in force', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);

  await writeOverride(ctx.overridePath, {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 200, tokens: 250_000_000 },
  });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    periods: { day: { limit: { dollars: 200, tokens: 250_000_000 } } },
  });
});

test('it ignores an override for a day that has ended', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/limits', ctx.limits);

  await writeOverride(ctx.overridePath, {
    period: 'day',
    start: '2026-11-12',
    limit: { dollars: 200, tokens: 250_000_000 },
  });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({ periods: { day: { limit: ctx.limits.day } } });
});

test('it registers a sandbox with a limit and a zero count', async () => {
  const ctx = await setupTest();

  const put = await ctx.call('PUT', '/sandboxes/alpha', {
    limit: { dollars: 2, tokens: 2_000_000 },
  });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(put).toStrictEqual({ status: 204, body: null });

  expect(get).toStrictEqual({
    status: 200,
    body: { dollars: 0, tokens: 0, tripped: false },
  });
});

test('it sets the count of a sandbox that it already holds back to zero', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.store.addSpend('alpha', { dollars: 0.41, tokens: 380_000 });
  await ctx.call('PUT', '/sandboxes/alpha', { limit: { dollars: 2, tokens: 2_000_000 } });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toStrictEqual({ dollars: 0, tokens: 0, tripped: false });
});

test('it reports a sandbox past its limit as tripped', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: { dollars: 2, tokens: 2_000_000 } });
  await ctx.store.addSpend('alpha', { dollars: 2.5, tokens: 10 });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toStrictEqual({ dollars: 2.5, tokens: 10, tripped: true });
});

test('it reports a sandbox with no limit as never tripped', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.store.addSpend('alpha', { dollars: 500, tokens: 10 });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toStrictEqual({ dollars: 500, tokens: 10, tripped: false });
});

test('it answers a sandbox that the store lacks with a 404', async () => {
  const ctx = await setupTest();
  const get = await ctx.call('GET', '/sandboxes/ghost');

  expect(get.status).toBe(404);
});

test('it answers a sandbox named for an object property with a 404', async () => {
  const ctx = await setupTest();
  const get = await ctx.call('GET', '/sandboxes/constructor');

  expect(get.status).toBe(404);
});

test('it removes a sandbox and answers 204 again for a name the store lacks', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });

  const first = await ctx.call('DELETE', '/sandboxes/alpha');
  const second = await ctx.call('DELETE', '/sandboxes/alpha');
  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect([first.status, second.status, get.status]).toStrictEqual([204, 204, 404]);
});

test('it refuses a sandbox body with no limit key with a 400', async () => {
  const ctx = await setupTest();
  const put = await ctx.call('PUT', '/sandboxes/alpha', {});

  expect(put.status).toBe(400);
});

test('it refuses a sandbox name that is not a plain name with a 400', async () => {
  const ctx = await setupTest();
  const put = await ctx.call('PUT', '/sandboxes/.hidden', { limit: null });

  expect(put.status).toBe(400);
});

test('it answers an unknown path with a 404 and a wrong method with a 405', async () => {
  const ctx = await setupTest();
  const unknown = await ctx.call('GET', '/v1/messages');
  const wrongMethod = await ctx.call('POST', '/status');

  expect([unknown.status, wrongMethod.status]).toStrictEqual([404, 405]);
});
