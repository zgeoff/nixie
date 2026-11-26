import { mock } from 'bun:test';
import invariant from 'tiny-invariant';
import type { GatewayStatus, SpendGateway } from '../types';
import { buildMockPeriodStatus } from './build-mock-period-status';

export function buildMockGatewayStatus(overrides: Partial<GatewayStatus> = {}): GatewayStatus {
  const day = buildMockPeriodStatus();

  const month = buildMockPeriodStatus({
    start: '2026-11-01',
    resetsAt: '2026-12-01T00:00:00Z',
    limit: 600,
    cap: null,
  });

  return {
    zone: 'UTC',
    lost: false,
    providers: {
      main: { day: { ...day, limit: 100, cap: 200 }, month: { ...month, limit: 1000 } },
    },
    routes: {
      plan: { provider: 'main', day, month },
      metered: { provider: 'main', day: { ...day, limit: 5, cap: 10 }, month },
    },
    ...overrides,
  };
}

// Every call answers ok until a test sets another answer with `mockResolvedValue`.
export function buildStubSpendGateway() {
  return {
    readStatus: mock<SpendGateway['readStatus']>(() =>
      Promise.resolve({ kind: 'ok', value: buildMockGatewayStatus() }),
    ),
    readChatGPTLogins: mock<SpendGateway['readChatGPTLogins']>(() =>
      Promise.resolve({ kind: 'ok', value: {} }),
    ),
    postRaise: mock<SpendGateway['postRaise']>(() =>
      Promise.resolve({ kind: 'ok', value: buildMockGatewayStatus() }),
    ),
    postCount: mock<SpendGateway['postCount']>(() => Promise.resolve({ kind: 'ok' })),
    putSandbox: mock<SpendGateway['putSandbox']>(() => Promise.resolve({ kind: 'ok' })),
    patchSandbox: mock<SpendGateway['patchSandbox']>(() => Promise.resolve({ kind: 'ok' })),
    readSandbox: mock<SpendGateway['readSandbox']>(() =>
      Promise.resolve({
        kind: 'ok',
        value: { dollars: 0, tokens: 0, tripped: false, lastRefusal: null, limitRevision: 0 },
      }),
    ),
    removeSandbox: mock<SpendGateway['removeSandbox']>(() => Promise.resolve({ kind: 'ok' })),
  } satisfies SpendGateway;
}

// The route `plan` passed its day limit of 40 dollars, and the route `metered` is under its own.
export function buildTrippedGatewayStatus(): GatewayStatus {
  const status = buildMockGatewayStatus();
  const plan = status.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  return buildMockGatewayStatus({
    routes: {
      ...status.routes,
      plan: {
        ...plan,
        day: {
          ...plan.day,
          dollars: 41.2,
          tripped: true,
          sinceMs: Date.parse('2026-11-13T08:42:07Z'),
        },
      },
    },
  });
}

// The provider `main` passed its day limit of 100 dollars, and each route of it is under its own.
export function buildProviderTrippedGatewayStatus(): GatewayStatus {
  const status = buildMockGatewayStatus();
  const main = status.providers['main'];

  invariant(main !== undefined, 'the mock status holds the provider main');

  return buildMockGatewayStatus({
    providers: {
      main: {
        ...main,
        day: {
          ...main.day,
          dollars: 101.5,
          tripped: true,
          sinceMs: Date.parse('2026-11-13T08:42:07Z'),
        },
      },
    },
  });
}
