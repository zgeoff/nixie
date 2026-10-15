import { expect, test } from 'bun:test';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { buildMockSummarizeFrame } from '@heynixie/wire/test-utils';
import { runGuestSummary } from './run-guest-summary';
import { buildStubSandboxes } from './test-utils/build-stub-sandboxes';

function setupTest() {
  return { sandboxes: buildStubSandboxes() };
}

test('it sends the summarize frame and returns the summary the guest reports', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation' }),
  );

  const frame = buildMockSummarizeFrame();

  const summary = await runGuestSummary({
    sandbox,
    command: { argv: ['guest'], env: {} },
    frame,
    signal: new AbortController().signal,
  });

  expect(summary).toStrictEqual({
    type: 'summarized',
    boundary: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
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
      sandbox,
      command: { argv: ['guest'], env: {} },
      frame: buildMockSummarizeFrame(),
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow(
    'the summary call failed: error: the summary call ended with no summary: api_error',
  );
});

test('it fails with the abort reason and starts no guest when the signal has aborted', async () => {
  const ctx = setupTest();

  const sandbox = await ctx.sandboxes.adapter.create(
    buildMockSandboxSpec({ kind: 'conversation' }),
  );

  const signal = AbortSignal.abort(new Error('a forget invalidated the session'));

  expect(
    runGuestSummary({
      sandbox,
      command: { argv: ['guest'], env: {} },
      frame: buildMockSummarizeFrame(),
      signal,
    }),
  ).rejects.toThrow('a forget invalidated the session');

  expect(ctx.sandboxes.summaries).toStrictEqual([]);
});
