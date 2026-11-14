import { expect, test } from 'bun:test';
import { bindHarness } from '@heynixie/models';
import { buildMockModelProfile } from '@heynixie/models/test-utils';
import { buildMockSandboxSpec, buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { buildMockSummarizeFrame } from '@heynixie/wire/test-utils';
import { runGuestSummary } from './run-guest-summary';

function setupTest() {
  return { sandboxes: buildStubSandboxes(), harness: bindHarness(buildMockModelProfile()) };
}

test('it sends the summarize frame and returns the summary the guest reports', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation' }),
  );

  const frame = buildMockSummarizeFrame();

  const summary = await runGuestSummary({
    harness: ctx.harness,
    sandbox,
    command: { argv: ['guest'], env: {} },
    frame,
    signal: new AbortController().signal,
  });

  expect(summary).toStrictEqual({
    type: 'summarized',
    boundary: {
      harness: 'agent-sdk',
      sessionID: expect.toBeString(),
      messageID: expect.toBeString(),
    },
    text: 'Open threads: none.',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
  });

  expect(ctx.sandboxes.summaries).toStrictEqual([frame]);
});

test('it fails with the guest failure when the guest reports no summary', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation' }),
  );

  ctx.sandboxes.setSummaryScript(() => [
    {
      type: 'failed',
      reason: 'error',
      detail: 'the summary call ended with no summary: api_error',
    },
  ]);

  expect(
    runGuestSummary({
      harness: ctx.harness,
      sandbox,
      command: { argv: ['guest'], env: {} },
      frame: buildMockSummarizeFrame(),
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow(
    'the summary call failed: error: the summary call ended with no summary: api_error',
  );
});

test('it fails with the abort reason and sends no summary frame when the signal aborted while the guest started', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation' }),
  );

  const signal = AbortSignal.abort(new Error('a forget invalidated the session'));

  expect(
    runGuestSummary({
      harness: ctx.harness,
      sandbox,
      command: { argv: ['guest'], env: {} },
      frame: buildMockSummarizeFrame(),
      signal,
    }),
  ).rejects.toThrow('a forget invalidated the session');

  expect(ctx.sandboxes.summaries).toStrictEqual([]);
});
