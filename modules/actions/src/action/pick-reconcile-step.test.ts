import { expect, test } from 'bun:test';
import type { ReconcileFacts, ReconcileStep } from './pick-reconcile-step';
import { pickReconcileStep } from './pick-reconcile-step';

test.each<readonly [string, ReconcileFacts, ReconcileStep]>([
  [
    'retries under the key within its kept time',
    {
      reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 1000 },
      streak: 1,
      firstAttemptAt: 5000,
      lastAttemptAt: 5000,
      now: 5500,
      hasRetryLeft: true,
    },
    { kind: 'retry', at: 5500 },
  ],
  [
    'asks the owner once the key is no longer kept',
    {
      reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 1000 },
      streak: 1,
      firstAttemptAt: 5000,
      lastAttemptAt: 5000,
      now: 6000,
      hasRetryLeft: true,
    },
    { kind: 'owner', ownerReason: 'key_expired' },
  ],
  [
    'asks the owner with no reconciliation declared',
    {
      reconcile: { kind: 'none' },
      streak: 1,
      firstAttemptAt: 5000,
      lastAttemptAt: 5000,
      now: 5500,
      hasRetryLeft: true,
    },
    { kind: 'owner', ownerReason: 'no_reconcile' },
  ],
  [
    'asks the owner at the 3rd unknown in a row',
    {
      reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 1000 },
      streak: 3,
      firstAttemptAt: 5000,
      lastAttemptAt: 5000,
      now: 5500,
      hasRetryLeft: true,
    },
    { kind: 'owner', ownerReason: 'unknown_streak' },
  ],
  [
    'asks the owner when the retry schedule has no attempt left',
    {
      reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 1000 },
      streak: 1,
      firstAttemptAt: 5000,
      lastAttemptAt: 5000,
      now: 5500,
      hasRetryLeft: false,
    },
    { kind: 'owner', ownerReason: 'unknown_streak' },
  ],
  [
    'schedules a check after the default trust time',
    {
      reconcile: { kind: 'check', tool: 'test.send' },
      streak: 1,
      firstAttemptAt: 5000,
      lastAttemptAt: 5000,
      now: 5500,
      hasRetryLeft: true,
    },
    { kind: 'check', at: 65_000 },
  ],
  [
    'schedules a check after the declared trust time',
    {
      reconcile: { kind: 'check', tool: 'test.send', trustNegativeAfterMs: 2000 },
      streak: 1,
      firstAttemptAt: 5000,
      lastAttemptAt: 5000,
      now: 5500,
      hasRetryLeft: true,
    },
    { kind: 'check', at: 7000 },
  ],
])('it %s', (_name, facts, expected) => {
  expect(pickReconcileStep(facts)).toStrictEqual(expected);
});
