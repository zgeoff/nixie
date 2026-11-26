import { expect, test } from 'bun:test';
import { network } from '@heynixie/mock-server';
import { HttpResponse, http } from 'msw';
import { createSpendGateway } from './create-spend-gateway';

function setupTest() {
  const origin = 'http://gateway.test';

  return {
    origin,
    buildPeriod: () => ({
      start: '2026-11-13',
      resetsAt: '2026-11-14T00:00:00Z',
      dollars: 1,
      limit: 40,
      cap: 80,
      tripped: false,
      sinceMs: null,
    }),
    gateway: createSpendGateway({ url: origin, fetch: globalThis.fetch }),
  };
}

test('it reads a status with no providers, from an older gateway, as having none', async () => {
  const ctx = setupTest();
  const period = ctx.buildPeriod();

  network.use(
    http.get(`${ctx.origin}/status`, () =>
      HttpResponse.json({
        zone: 'UTC',
        lost: false,
        routes: { plan: { day: period, month: period } },
      }),
    ),
  );

  const status = await ctx.gateway.readStatus();

  expect(status).toMatchObject({
    kind: 'ok',
    value: { providers: {}, routes: { plan: { provider: '' } } },
  });
});

test('it reads the refusal that an older gateway stored with no provider', async () => {
  const ctx = setupTest();

  network.use(
    http.get(`${ctx.origin}/sandboxes/alpha`, () =>
      HttpResponse.json({
        dollars: 0,
        tokens: 0,
        tripped: false,
        lastRefusal: { counter: 'route_day', route: 'plan', atMs: 5 },
        limitRevision: 1,
      }),
    ),
  );

  const read = await ctx.gateway.readSandbox('alpha');

  expect(read).toMatchObject({
    kind: 'ok',
    value: { lastRefusal: { counter: 'route_day', route: 'plan', provider: '', atMs: 5 } },
  });
});

test('it reads a refusal at a provider limit', async () => {
  const ctx = setupTest();

  network.use(
    http.get(`${ctx.origin}/sandboxes/alpha`, () =>
      HttpResponse.json({
        dollars: 0,
        tokens: 0,
        tripped: false,
        lastRefusal: { counter: 'provider_month', route: 'plan', provider: 'main', atMs: 5 },
        limitRevision: 1,
      }),
    ),
  );

  const read = await ctx.gateway.readSandbox('alpha');

  expect(read).toMatchObject({
    kind: 'ok',
    value: { lastRefusal: { counter: 'provider_month', provider: 'main' } },
  });
});

test('it reads an above_cap that names a route and none that names a provider', async () => {
  const ctx = setupTest();

  network.use(
    http.post(`${ctx.origin}/raise`, () =>
      HttpResponse.json({ error: 'above_cap', route: 'plan', cap: 80 }, { status: 409 }),
    ),
  );

  const raised = await ctx.gateway.postRaise({
    target: { kind: 'route', id: 'plan' },
    start: '2026-11-13',
    dollars: 90,
  });

  expect(raised).toStrictEqual({ kind: 'above_cap', route: 'plan', provider: null, cap: 80 });
});

test('it sends a provider raise under the provider key and reads the 204 as ok', async () => {
  const ctx = setupTest();
  const sent: unknown[] = [];

  network.use(
    http.post(`${ctx.origin}/raise`, async (options) => {
      const body: unknown = await options.request.json();

      sent.push(body);

      return new HttpResponse(null, { status: 204 });
    }),
  );

  const raised = await ctx.gateway.postRaise({
    target: { kind: 'provider', id: 'main' },
    start: '2026-11-13',
    dollars: 150,
  });

  expect([raised, sent]).toStrictEqual([
    { kind: 'ok' },
    [{ provider: 'main', start: '2026-11-13', dollars: 150 }],
  ]);
});

test('it sends a count change under the target key and reads the dollars the gateway replaced', async () => {
  const ctx = setupTest();
  const sent: unknown[] = [];

  network.use(
    http.post(`${ctx.origin}/count`, async (options) => {
      const body: unknown = await options.request.json();

      sent.push(body);

      return HttpResponse.json({ replacedDollars: 101.5 });
    }),
  );

  const counted = await ctx.gateway.postCount({
    target: { kind: 'provider', id: 'main' },
    period: 'day',
    start: '2026-11-13',
    dollars: 0,
  });

  expect([counted, sent]).toStrictEqual([
    { kind: 'ok', value: { replacedDollars: 101.5 } },
    [{ provider: 'main', period: 'day', start: '2026-11-13', dollars: 0 }],
  ]);
});

test.each([
  ['a period that ended', 409, { error: 'period_ended' }, { kind: 'period_ended' as const }],
  [
    'a target the gateway lacks',
    404,
    { error: 'unknown_provider' },
    { kind: 'not_found' as const },
  ],
])('it reads %s as a count refusal', async (_name, status, body, expected) => {
  const ctx = setupTest();

  network.use(http.post(`${ctx.origin}/count`, () => HttpResponse.json(body, { status })));

  const counted = await ctx.gateway.postCount({
    target: { kind: 'provider', id: 'main' },
    period: 'day',
    start: '2026-11-13',
    dollars: 0,
  });

  expect(counted).toStrictEqual(expected);
});
