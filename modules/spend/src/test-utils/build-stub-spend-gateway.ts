import { mock } from 'bun:test';
import type { GatewayStatus, SpendGateway } from '../types';

export function buildMockGatewayStatus(overrides: Partial<GatewayStatus> = {}): GatewayStatus {
  const period = {
    start: '2026-11-13',
    resetsAt: '2026-11-14T00:00:00Z',
    spent: { dollars: 0, tokens: 0 },
    limit: { dollars: 60, tokens: 80_000_000 },
    cap: { dollars: 120, tokens: 160_000_000 },
  };

  return {
    zone: 'UTC',
    lost: false,
    periods: { day: period, month: { ...period, start: '2026-11-01' } },
    tripped: null,
    ...overrides,
  };
}

// Every call answers ok until a test sets another answer with `mockResolvedValue`.
export function buildStubSpendGateway() {
  return {
    readStatus: mock<SpendGateway['readStatus']>(() =>
      Promise.resolve({ kind: 'ok', value: buildMockGatewayStatus() }),
    ),
    putLimits: mock<SpendGateway['putLimits']>(() =>
      Promise.resolve({ kind: 'ok', value: buildMockGatewayStatus() }),
    ),
    postRaise: mock<SpendGateway['postRaise']>(() =>
      Promise.resolve({ kind: 'ok', value: buildMockGatewayStatus() }),
    ),
    putSandbox: mock<SpendGateway['putSandbox']>(() => Promise.resolve({ kind: 'ok' })),
    readSandbox: mock<SpendGateway['readSandbox']>(() =>
      Promise.resolve({ kind: 'ok', value: { dollars: 0, tokens: 0, tripped: false } }),
    ),
    removeSandbox: mock<SpendGateway['removeSandbox']>(() => Promise.resolve({ kind: 'ok' })),
  } satisfies SpendGateway;
}
