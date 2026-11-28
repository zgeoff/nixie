import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { formatCanonicalJSON } from '../pin/format-canonical-json';
import { buildServerFacts } from '../test-utils/build-server-facts';
import type { McpOperation } from '../types';
import { buildOperationHash } from './build-operation-hash';
import { pickActionHash } from './pick-action-hash';

function setupTest() {
  const operation: McpOperation = {
    change: 'server',
    serverID: 'tracker',
    facts: buildServerFacts(),
  };

  return {
    operation,
    hashWithFlag: (trusted: boolean) =>
      createHash('sha256')
        .update(formatCanonicalJSON({ ...operation, facts: { ...operation.facts, trusted } }))
        .digest('hex'),
  };
}

test.each([true, false])(
  'it keeps the stored hash of a server proposal stored with trusted %p',
  (trusted) => {
    const ctx = setupTest();
    const stored = ctx.hashWithFlag(trusted);

    expect(pickActionHash(ctx.operation, stored)).toBe(stored);
  },
);

test('it picks the hash of the facts when the stored hash binds other facts', () => {
  const ctx = setupTest();

  const other: McpOperation = {
    change: 'server',
    serverID: 'tracker',
    facts: buildServerFacts({ scope: 'read write' }),
  };

  expect(pickActionHash(ctx.operation, buildOperationHash(other))).toBe(
    buildOperationHash(ctx.operation),
  );
});

test('it picks the hash of a tool operation whatever hash is stored', () => {
  const operation: McpOperation = {
    change: 'allow',
    tool: 'tracker.item_get',
    fromHash: null,
    hash: 'abc',
  };

  expect(pickActionHash(operation, 'stale')).toBe(buildOperationHash(operation));
});
