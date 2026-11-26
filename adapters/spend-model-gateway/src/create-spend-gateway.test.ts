import { expect, test } from 'bun:test';
import { createSpendGateway } from './create-spend-gateway';

function setupTest() {
  return {
    buildPeriod: () => ({
      start: '2026-11-13',
      resetsAt: '2026-11-14T00:00:00Z',
      dollars: 1,
      limit: 40,
      cap: 80,
      tripped: false,
      sinceMs: null,
    }),
    createGateway: (body: unknown, status = 200) => {
      const answerRequest = () => Promise.resolve(Response.json(body, { status }));

      return createSpendGateway({ url: 'http://gateway.test', fetch: answerRequest });
    },
  };
}

test('it reads a status with no providers, from an older gateway, as having none', async () => {
  const ctx = setupTest();
  const period = ctx.buildPeriod();

  const gateway = ctx.createGateway({
    zone: 'UTC',
    lost: false,
    routes: { plan: { day: period, month: period } },
  });

  const status = await gateway.readStatus();

  expect(status).toMatchObject({
    kind: 'ok',
    value: { providers: {}, routes: { plan: { provider: '' } } },
  });
});

test('it reads the refusal that an older gateway stored with no provider', async () => {
  const ctx = setupTest();

  const gateway = ctx.createGateway({
    dollars: 0,
    tokens: 0,
    tripped: false,
    lastRefusal: { counter: 'route_day', route: 'plan', atMs: 5 },
    limitRevision: 1,
  });

  const read = await gateway.readSandbox('alpha');

  expect(read).toMatchObject({
    kind: 'ok',
    value: { lastRefusal: { counter: 'route_day', route: 'plan', provider: '', atMs: 5 } },
  });
});

test('it reads a refusal at a provider limit', async () => {
  const ctx = setupTest();

  const gateway = ctx.createGateway({
    dollars: 0,
    tokens: 0,
    tripped: false,
    lastRefusal: { counter: 'provider_month', route: 'plan', provider: 'main', atMs: 5 },
    limitRevision: 1,
  });

  const read = await gateway.readSandbox('alpha');

  expect(read).toMatchObject({
    kind: 'ok',
    value: { lastRefusal: { counter: 'provider_month', provider: 'main' } },
  });
});

test('it reads an above_cap that names a route and none that names a provider', async () => {
  const ctx = setupTest();
  const gateway = ctx.createGateway({ error: 'above_cap', route: 'plan', cap: 80 }, 409);

  const raised = await gateway.postRaise({
    target: { kind: 'route', id: 'plan' },
    start: '2026-11-13',
    dollars: 90,
  });

  expect(raised).toStrictEqual({ kind: 'above_cap', route: 'plan', provider: null, cap: 80 });
});
