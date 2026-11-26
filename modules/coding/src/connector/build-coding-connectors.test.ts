import { expect, test } from 'bun:test';
import { buildFakeCodingAdapter } from '../test-utils/build-fake-coding-adapter';
import { buildCodingConnectors } from './build-coding-connectors';

function setupTest() {
  const adapter = buildFakeCodingAdapter();

  return { adapter, connectors: buildCodingConnectors(adapter) };
}

test.each(['coding.spawn', 'coding.start'])(
  'it spawns a session for a queued %s action',
  async (tool) => {
    const ctx = setupTest();
    const connector = ctx.connectors.get(tool);

    expect(connector).toBeDefined();

    const response = await connector?.run({
      actionID: 'a1',
      tool,
      arguments: {
        name: 'Login fix',
        prompt: 'Fix the login test.',
        repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
        target: { daemon: 'cloud', target: 'cloud' },
      },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'key-1',
      destinations: [],
      actionHash: 'hash-1',
      deadlineAt: null,
    });

    expect(response).toStrictEqual({
      kind: 'success',
      result: {
        sessionID: expect.toBeString(),
        state: expect.toBeString(),
        fromCursor: expect.toBeString(),
      },
    });

    expect(ctx.adapter.calls.map((call) => call.method)).toStrictEqual(['start']);
  },
);
