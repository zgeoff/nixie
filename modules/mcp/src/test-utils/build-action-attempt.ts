import type { ActionAttempt } from '@heynixie/connectors';

// One attempt of a queued action with every field set, for a test to change one field of.
export function buildActionAttempt(overrides: Partial<ActionAttempt> = {}): ActionAttempt {
  return {
    actionID: 'action-1',
    tool: 'tracker.item_create',
    arguments: { title: 'water the plants' },
    snapshotHash: 'sha256:test',
    attempt: 1,
    idempotencyKey: 'key-1',
    destinations: [],
    actionHash: 'sha256:a',
    deadlineAt: null,
    ...overrides,
  };
}
