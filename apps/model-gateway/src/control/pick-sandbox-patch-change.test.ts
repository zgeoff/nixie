import { expect, test } from 'bun:test';
import type { PeriodStore } from '../types';
import { noTokenCeiling, pickSandboxPatchChange } from './pick-sandbox-patch-change';

function setupTest() {
  const store: PeriodStore = {
    version: 3,
    lost: false,
    routes: {},
    sandboxes: {
      alpha: {
        micros: 1_840_000,
        tokens: 610_000,
        limit: { dollars: 2, tokens: 2_000_000 },
        lastRefusal: null,
      },
    },
  };

  return { store };
}

test('it sets a limit whole and keeps the count', () => {
  const ctx = setupTest();
  const change = pickSandboxPatchChange(ctx.store, 'alpha', { dollars: 1.6, tokens: 100 });

  expect(change.result).toStrictEqual({ kind: 'done' });

  expect(change.store?.sandboxes['alpha']).toStrictEqual({
    micros: 1_840_000,
    tokens: 610_000,
    limit: { dollars: 1.6, tokens: 100 },
    lastRefusal: null,
  });
});

test('it gives a limit with no tokens no token ceiling', () => {
  const ctx = setupTest();
  const change = pickSandboxPatchChange(ctx.store, 'alpha', { dollars: 3 });

  expect(change.store?.sandboxes['alpha']?.limit).toStrictEqual({
    dollars: 3,
    tokens: noTokenCeiling,
  });
});

test('it clears a limit with null', () => {
  const ctx = setupTest();
  const change = pickSandboxPatchChange(ctx.store, 'alpha', null);

  expect(change.store?.sandboxes['alpha']?.limit).toBeNull();
});

test('it changes nothing for a name the store lacks', () => {
  const ctx = setupTest();
  const change = pickSandboxPatchChange(ctx.store, 'ghost', { dollars: 1 });

  expect(change).toStrictEqual({ store: null, result: { kind: 'not_found' } });
});
