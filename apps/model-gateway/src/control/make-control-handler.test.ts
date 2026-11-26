import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { createPlanLogin } from '../login/create-plan-login';
import { writeLoginFile } from '../login/write-login-file';
import { makeOverrideReader } from '../override/make-override-reader';
import { writeOverride } from '../override/write-override';
import { createPeriodStore } from '../periods/create-period-store';
import type { LimitTable } from '../periods/limit-table';
import { buildLoginFile } from '../test-utils/build-login-file';
import { makeControlHandler } from './make-control-handler';

async function setupTest() {
  const limits: LimitTable = {
    routes: {
      plan: { day: 40, month: 600, dayCap: 80 },
      metered: { day: 5, month: 50, dayCap: 10 },
      bare: null,
    },
    providers: {
      main: { day: 100, month: 1000, dayCap: 200 },
      side: { day: 3, month: 30, dayCap: 6 },
    },
    providerOf: { plan: 'main', metered: 'main', bare: 'side' },
  };

  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-control-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  let current = Date.parse('2026-11-13T16:42:07Z');
  const now = () => current;
  const overridePath = join(directory, 'override.json');

  const store = await createPeriodStore({
    path: join(directory, 'store.json'),
    zone: 'Europe/London',
    now,
    limits,
    readOverrides: makeOverrideReader(
      overridePath,
      mock<Logger>(() => {}),
    ),
    log: mock<Logger>(() => {}),
  });

  const loginPath = join(directory, 'plan-login.json');

  await writeFile(join(directory, 'plan-key'), 'route-key\n');

  const planLogin = await createPlanLogin({
    routeID: 'codex-plan',
    config: { file: loginPath, routeKeyFile: join(directory, 'plan-key') },
    send: () => Promise.reject(new Error('the control handler never refreshes')),
    now,
    sleep: () => Promise.resolve(),
    log: mock<Logger>(() => {}),
  });

  const handler = makeControlHandler({
    store,
    logins: { 'codex-plan': planLogin },
    token: 'secret-control-token',
    now,
    log: mock<Logger>(() => {}),
    limits,
    config: {
      zone: 'Europe/London',
      control: { listen: { hostname: '127.0.0.1', port: 0 }, tokenFile: join(directory, 'token') },
      countBySandbox: true,
      override: overridePath,
    },
  });

  return {
    store,
    plan: { route: 'plan', provider: 'main' },
    metered: { route: 'metered', provider: 'main' },
    bare: { route: 'bare', provider: 'side' },
    today: '2026-11-13',
    overridePath,
    writeLogin: (overrides: Parameters<typeof buildLoginFile>[0]) =>
      writeLoginFile(loginPath, buildLoginFile(overrides)),
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
  ['GET', '/chatgpt-logins'],
  ['POST', '/raise'],
  ['POST', '/count'],
  ['PUT', '/sandboxes/alpha'],
  ['GET', '/sandboxes/alpha'],
  ['PATCH', '/sandboxes/alpha'],
  ['DELETE', '/sandboxes/alpha'],
  ['GET', '/anything-else'],
])('it answers %s %s with a 401 and no change when the token is wrong', async (method, path) => {
  const ctx = await setupTest();

  const response = await ctx.call(
    method,
    path,
    { route: 'plan', start: '2026-11-13', dollars: 50 },
    'Bearer not-the-token',
  );

  const held = await ctx.store.read();

  expect(response.status).toBe(401);
  expect(held.routes['plan']?.day.raise).toBeNull();
});

test('it reports a plan route with no login file as needing a login', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('GET', '/chatgpt-logins');

  expect(response).toStrictEqual({
    status: 200,
    body: {
      'codex-plan': {
        status: 'needs_login',
        reason: null,
        since: null,
        accountID: null,
        planType: null,
      },
    },
  });
});

test('it reports the status, account and plan of a plan login, and no token or email', async () => {
  const ctx = await setupTest();

  await ctx.writeLogin({ status: 'failing', reason: 'no_answer' });

  const response = await ctx.call('GET', '/chatgpt-logins');

  expect(response).toStrictEqual({
    status: 200,
    body: {
      'codex-plan': {
        status: 'failing',
        reason: 'no_answer',
        since: '2026-11-13T09:12:00.000Z',
        accountID: 'acct-test-1',
        planType: 'plus',
      },
    },
  });

  expect(JSON.stringify(response.body)).not.toContain('refresh-token-1');
  expect(JSON.stringify(response.body)).not.toContain('owner@example.com');
});

test('it answers POST /chatgpt-logins with a 405', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('POST', '/chatgpt-logins');

  expect(response.status).toBe(405);
});

test('it answers a request with no authorization header with a 401', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('GET', '/status', undefined, '');

  expect(response.status).toBe(401);
});

test('it reports each provider and each route with its provider, count, limit and cap', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('GET', '/status');

  const day = (limit: number | null, cap: number | null) => ({
    start: ctx.today,
    resetsAt: '2026-11-14T00:00:00Z',
    dollars: 0,
    limit,
    cap,
    tripped: false,
    sinceMs: null,
  });

  const month = (limit: number | null) => ({
    start: ctx.today.replace(/-\d{2}$/u, '-01'),
    resetsAt: '2026-12-01T00:00:00Z',
    dollars: 0,
    limit,
    cap: null,
    tripped: false,
    sinceMs: null,
  });

  expect(response).toStrictEqual({
    status: 200,
    body: {
      zone: 'Europe/London',
      lost: false,
      providers: {
        main: { day: day(100, 200), month: month(1000) },
        side: { day: day(3, 6), month: month(30) },
      },
      routes: {
        plan: { provider: 'main', day: day(40, 80), month: month(600) },
        metered: { provider: 'main', day: day(5, 10), month: month(50) },
        bare: { provider: 'side', day: day(null, null), month: month(null) },
      },
    },
  });
});

test('it answers PUT /limits with a 404, because the limits live in the config', async () => {
  const ctx = await setupTest();
  const response = await ctx.call('PUT', '/limits', {});

  expect(response.status).toBe(404);
});

test('it raises the day of the route it names and no other route', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    route: 'plan',
    start: '2026-11-13',
    dollars: 60,
  });

  expect(response).toMatchObject({
    status: 200,
    body: {
      routes: { plan: { day: { limit: 60 } }, metered: { day: { limit: 5 } } },
    },
  });
});

test('it keeps the larger of 2 raises of the same day, whatever their order', async () => {
  const ctx = await setupTest();

  await ctx.call('POST', '/raise', { route: 'plan', start: '2026-11-13', dollars: 70 });

  const response = await ctx.call('POST', '/raise', {
    route: 'plan',
    start: '2026-11-13',
    dollars: 60,
  });

  expect(response).toMatchObject({ body: { routes: { plan: { day: { limit: 70 } } } } });
});

test('it refuses a raise past the route cap with a 409 and keeps the limit', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    route: 'metered',
    start: '2026-11-13',
    dollars: 10.01,
  });

  const held = await ctx.store.read();

  expect(response).toStrictEqual({
    status: 409,
    body: { error: 'above_cap', route: 'metered', provider: null, cap: 10 },
  });

  expect(held.routes['metered']?.day.raise).toBeNull();
});

test('it refuses a raise for a day that is not the one in force with a 409', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    route: 'plan',
    start: '2026-11-12',
    dollars: 60,
  });

  const held = await ctx.store.read();

  expect(response).toStrictEqual({ status: 409, body: { error: 'period_ended' } });
  expect(held.routes['plan']?.day.raise).toBeNull();
});

test('it refuses a raise of the day that names a day that ended at midnight', async () => {
  const ctx = await setupTest();

  ctx.moveTo('2026-11-14T00:00:00Z');

  const response = await ctx.call('POST', '/raise', {
    route: 'plan',
    start: '2026-11-13',
    dollars: 60,
  });

  expect(response).toStrictEqual({ status: 409, body: { error: 'period_ended' } });
});

test('it refuses a raise for a route the gateway does not hold with a 404', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    route: 'ghost',
    start: '2026-11-13',
    dollars: 60,
  });

  expect(response).toStrictEqual({ status: 404, body: { error: 'unknown_route' } });
});

test('it raises the day of the provider it names and no route', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    provider: 'main',
    start: '2026-11-13',
    dollars: 150,
  });

  expect(response).toMatchObject({
    status: 200,
    body: {
      providers: { main: { day: { limit: 150 } }, side: { day: { limit: 3 } } },
      routes: { plan: { day: { limit: 40 } } },
    },
  });
});

test('it refuses a raise past the provider cap with a 409 that names the provider', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    provider: 'side',
    start: '2026-11-13',
    dollars: 6.01,
  });

  expect(response).toStrictEqual({
    status: 409,
    body: { error: 'above_cap', route: null, provider: 'side', cap: 6 },
  });
});

test('it refuses a raise for a provider the gateway does not hold with a 404', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    provider: 'ghost',
    start: '2026-11-13',
    dollars: 5,
  });

  expect(response).toStrictEqual({ status: 404, body: { error: 'unknown_provider' } });
});

test('it refuses a raise for a route with no limit of its own with a 409', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    route: 'bare',
    start: '2026-11-13',
    dollars: 5,
  });

  expect(response).toStrictEqual({ status: 409, body: { error: 'no_route_limit', route: 'bare' } });
});

test.each([
  ['both a route and a provider', { route: 'plan', provider: 'main' }],
  ['neither', {}],
])('it refuses a raise that names %s with a 400', async (_name, target) => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    ...target,
    start: '2026-11-13',
    dollars: 5,
  });

  expect(response).toStrictEqual({ status: 400, body: { error: 'bad_target' } });
});

test('it reports a trip on the provider that reached its day limit, and on its routes never', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.bare, null, { dollars: 3, tokens: 1 });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    providers: {
      side: { day: { dollars: 3, tripped: true, sinceMs: Date.parse('2026-11-13T16:42:07Z') } },
      main: { day: { tripped: false } },
    },
    routes: { bare: { day: { tripped: false, sinceMs: null } } },
  });
});

test('it lowers the count of a route with POST /count and clears its trip', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.metered, null, { dollars: 5.2, tokens: 1 });

  const response = await ctx.call('POST', '/count', {
    route: 'metered',
    period: 'day',
    start: '2026-11-13',
    dollars: 0,
  });

  const status = await ctx.call('GET', '/status');

  expect(response).toStrictEqual({ status: 204, body: null });

  expect(status.body).toMatchObject({
    routes: { metered: { day: { dollars: 0, limit: 5, tripped: false, sinceMs: null } } },
  });
});

test('it lowers the count of a provider with POST /count, clears its trip and leaves its routes', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.bare, null, { dollars: 3, tokens: 1 });

  const response = await ctx.call('POST', '/count', {
    provider: 'side',
    period: 'day',
    start: '2026-11-13',
    dollars: 1,
  });

  const status = await ctx.call('GET', '/status');

  expect(response.status).toBe(204);

  expect(status.body).toMatchObject({
    providers: { side: { day: { dollars: 1, limit: 3, tripped: false, sinceMs: null } } },
    routes: { bare: { day: { dollars: 3 } } },
  });
});

test('it sets the count of the month and keeps the day', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.plan, null, { dollars: 4, tokens: 1 });

  await ctx.call('POST', '/count', {
    route: 'plan',
    period: 'month',
    start: '2026-11-01',
    dollars: 1.5,
  });

  const held = await ctx.store.read();

  expect([held.routes['plan']?.day.micros, held.routes['plan']?.month.micros]).toStrictEqual([
    4_000_000, 1_500_000,
  ]);
});

test('it changes no limit with POST /count', async () => {
  const ctx = await setupTest();

  await ctx.call('POST', '/count', {
    provider: 'main',
    period: 'day',
    start: '2026-11-13',
    dollars: 500,
  });

  const status = await ctx.call('GET', '/status');

  expect(status.body).toMatchObject({
    providers: { main: { day: { dollars: 500, limit: 100, tripped: true } } },
  });
});

test.each([
  [
    'a period that ended',
    { route: 'plan', period: 'day', start: '2026-11-12', dollars: 0 },
    409,
    { error: 'period_ended' },
  ],
  [
    'a route the gateway does not hold',
    { route: 'ghost', period: 'day', start: '2026-11-13', dollars: 0 },
    404,
    { error: 'unknown_route' },
  ],
  [
    'a provider the gateway does not hold',
    { provider: 'ghost', period: 'day', start: '2026-11-13', dollars: 0 },
    404,
    { error: 'unknown_provider' },
  ],
  [
    'both a route and a provider',
    { route: 'plan', provider: 'main', period: 'day', start: '2026-11-13', dollars: 0 },
    400,
    { error: 'bad_target' },
  ],
  [
    'neither a route nor a provider',
    { period: 'day', start: '2026-11-13', dollars: 0 },
    400,
    { error: 'bad_target' },
  ],
])('it refuses POST /count for %s', async (_name, body, status, answer) => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.plan, null, { dollars: 4, tokens: 1 });

  const response = await ctx.call('POST', '/count', body);
  const held = await ctx.store.read();

  expect(response).toStrictEqual({ status, body: answer });
  expect(held.routes['plan']?.day.micros).toBe(4_000_000);
});

test('it refuses a negative count with a 400', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/count', {
    route: 'plan',
    period: 'day',
    start: '2026-11-13',
    dollars: -1,
  });

  expect(response.status).toBe(400);
});

test('it refuses a raise of the month with a 400', async () => {
  const ctx = await setupTest();

  const response = await ctx.call('POST', '/raise', {
    route: 'plan',
    period: 'month',
    start: '2026-11-01',
    dollars: 900,
  });

  expect(response.status).toBe(400);
});

test('it reports a trip on the route that reached its day limit and on no other', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.metered, null, { dollars: 5.2, tokens: 1 });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    routes: {
      metered: {
        day: { dollars: 5.2, tripped: true, sinceMs: Date.parse('2026-11-13T16:42:07Z') },
      },
      plan: { day: { tripped: false, sinceMs: null } },
    },
  });
});

test('it reports the instant the day first reached its limit on a status read made later', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.metered, null, { dollars: 5.2, tokens: 1 });

  ctx.moveTo('2026-11-13T18:05:00Z');

  await ctx.store.addSpend(ctx.metered, null, { dollars: 1, tokens: 1 });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    routes: { metered: { day: { sinceMs: Date.parse('2026-11-13T16:42:07Z') } } },
  });
});

test('it clears a trip once a raise lifts the limit above the count', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.metered, null, { dollars: 5.2, tokens: 1 });
  await ctx.call('POST', '/raise', { route: 'metered', start: '2026-11-13', dollars: 9 });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    routes: { metered: { day: { tripped: false, sinceMs: null } } },
  });
});

test('it reports a trip that no longer holds once midnight has reset the day', async () => {
  const ctx = await setupTest();

  await ctx.store.addSpend(ctx.metered, null, { dollars: 5.2, tokens: 1 });

  ctx.moveTo('2026-11-14T00:00:00Z');

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({
    routes: { metered: { day: { start: '2026-11-14', dollars: 0, tripped: false } } },
  });
});

test('it reports the lost mark', async () => {
  const ctx = await setupTest();

  await ctx.store.markLost();

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({ lost: true });
});

test('it reports the override as the limit in force while it applies to the day in force', async () => {
  const ctx = await setupTest();

  await writeOverride(ctx.overridePath, {
    routes: { plan: { start: '2026-11-13', dollars: 200 } },
    providers: {},
  });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({ routes: { plan: { day: { limit: 200 } } } });
});

test('it ignores an override for a day that has ended', async () => {
  const ctx = await setupTest();

  await writeOverride(ctx.overridePath, {
    routes: { plan: { start: '2026-11-12', dollars: 200 } },
    providers: {},
  });

  const response = await ctx.call('GET', '/status');

  expect(response.body).toMatchObject({ routes: { plan: { day: { limit: 40 } } } });
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
    body: { dollars: 0, tokens: 0, tripped: false, lastRefusal: null, limitRevision: 1 },
  });
});

test('it sets the count of a sandbox that it already holds back to zero', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.store.addSpend(ctx.plan, 'alpha', { dollars: 0.41, tokens: 380_000 });
  await ctx.call('PUT', '/sandboxes/alpha', { limit: { dollars: 2, tokens: 2_000_000 } });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toStrictEqual({
    dollars: 0,
    tokens: 0,
    tripped: false,
    lastRefusal: null,
    limitRevision: 2,
  });
});

test('it reports a sandbox past its limit as tripped', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: { dollars: 2, tokens: 2_000_000 } });
  await ctx.store.addSpend(ctx.plan, 'alpha', { dollars: 2.5, tokens: 10 });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toStrictEqual({
    dollars: 2.5,
    tokens: 10,
    tripped: true,
    lastRefusal: null,
    limitRevision: 1,
  });
});

test('it reports a sandbox with no limit as never tripped', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.store.addSpend(ctx.plan, 'alpha', { dollars: 500, tokens: 10 });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toStrictEqual({
    dollars: 500,
    tokens: 10,
    tripped: false,
    lastRefusal: null,
    limitRevision: 1,
  });
});

test('it reports the last refusal of a sandbox', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });

  await ctx.store.writeRefusal('alpha', {
    counter: 'route_day',
    route: 'plan',
    provider: 'main',
    atMs: 99,
  });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toMatchObject({
    lastRefusal: { counter: 'route_day', route: 'plan', provider: 'main', atMs: 99 },
  });
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

test('it sets the limit of a sandbox whole with a patch and keeps its count', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: { dollars: 2, tokens: 2_000_000 } });
  await ctx.store.addSpend(ctx.plan, 'alpha', { dollars: 0.5, tokens: 40 });

  await ctx.store.writeRefusal('alpha', {
    counter: 'route_day',
    route: 'plan',
    provider: 'main',
    atMs: 99,
  });

  const patch = await ctx.call('PATCH', '/sandboxes/alpha', { limit: { dollars: 0.5 } });
  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(patch).toStrictEqual({ status: 204, body: null });

  expect(get.body).toStrictEqual({
    dollars: 0.5,
    tokens: 40,
    tripped: true,
    lastRefusal: { counter: 'route_day', route: 'plan', provider: 'main', atMs: 99 },
    limitRevision: 2,
  });
});

test('it takes a patched limit of zero dollars and refuses the sandbox at once', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });

  const patch = await ctx.call('PATCH', '/sandboxes/alpha', { limit: { dollars: 0 } });
  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(patch).toStrictEqual({ status: 204, body: null });

  expect(get.body).toStrictEqual({
    dollars: 0,
    tokens: 0,
    tripped: true,
    lastRefusal: null,
    limitRevision: 2,
  });
});

test('it sets a patched limit that names the revision the sandbox holds', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });

  const patch = await ctx.call('PATCH', '/sandboxes/alpha', {
    limit: { dollars: 0 },
    revision: 1,
  });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(patch).toStrictEqual({ status: 204, body: null });

  expect(get.body).toStrictEqual({
    dollars: 0,
    tokens: 0,
    tripped: true,
    lastRefusal: null,
    limitRevision: 2,
  });
});

test('it refuses with a 409 a patch that names a revision a newer write replaced, and keeps the newer limit', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.call('PATCH', '/sandboxes/alpha', { limit: { dollars: 0 }, revision: 1 });

  const late = await ctx.call('PATCH', '/sandboxes/alpha', {
    limit: { dollars: 4 },
    revision: 1,
  });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(late).toStrictEqual({ status: 409, body: { error: 'revision_changed' } });

  expect(get.body).toStrictEqual({
    dollars: 0,
    tokens: 0,
    tripped: true,
    lastRefusal: null,
    limitRevision: 2,
  });
});

test('it refuses with a 409 a patch that names a revision of a sandbox removed and registered again under its name', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.call('DELETE', '/sandboxes/alpha');
  await ctx.call('PUT', '/sandboxes/alpha', { limit: { dollars: 0 } });

  const late = await ctx.call('PATCH', '/sandboxes/alpha', {
    limit: { dollars: 4 },
    revision: 1,
  });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(late).toStrictEqual({ status: 409, body: { error: 'revision_changed' } });

  expect(get.body).toStrictEqual({
    dollars: 0,
    tokens: 0,
    tripped: true,
    lastRefusal: null,
    limitRevision: 2,
  });
});

test('it goes on from the revision of the entry that a registration replaces', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });

  const late = await ctx.call('PATCH', '/sandboxes/alpha', {
    limit: { dollars: 4 },
    revision: 1,
  });

  expect(late).toStrictEqual({ status: 409, body: { error: 'revision_changed' } });
});

test('it rejects a patched limit below zero dollars', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });

  const patch = await ctx.call('PATCH', '/sandboxes/alpha', { limit: { dollars: -1 } });

  expect(patch.status).toBe(400);
});

test('it sets no token limit for a patched limit with no tokens', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });
  await ctx.store.addSpend(ctx.plan, 'alpha', { dollars: 0.1, tokens: 900_000_000 });
  await ctx.call('PATCH', '/sandboxes/alpha', { limit: { dollars: 5 } });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toMatchObject({ tripped: false });
});

test('it clears the limit of a sandbox with a patch of null', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: { dollars: 1 } });
  await ctx.store.addSpend(ctx.plan, 'alpha', { dollars: 3, tokens: 1 });
  await ctx.call('PATCH', '/sandboxes/alpha', { limit: null });

  const get = await ctx.call('GET', '/sandboxes/alpha');

  expect(get.body).toMatchObject({ dollars: 3, tripped: false });
});

test('it answers a patch of a sandbox that the store lacks with a 404 and adds none', async () => {
  const ctx = await setupTest();
  const patch = await ctx.call('PATCH', '/sandboxes/ghost', { limit: { dollars: 1 } });
  const get = await ctx.call('GET', '/sandboxes/ghost');

  expect([patch.status, get.status]).toStrictEqual([404, 404]);
});

test('it refuses a patch with no limit key with a 400', async () => {
  const ctx = await setupTest();

  await ctx.call('PUT', '/sandboxes/alpha', { limit: null });

  const patch = await ctx.call('PATCH', '/sandboxes/alpha', {});

  expect(patch.status).toBe(400);
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
