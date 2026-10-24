import { expect, test } from 'bun:test';
import { formatReplyReport } from './format-reply-report.ts';
import { buildMockReplyRecord } from './test-utils/build-mock-reply-record.ts';

test('it reports timings, gaps, tool calls, cost and the pass criteria per candidate', () => {
  const report = formatReplyReport([
    { ...buildMockReplyRecord({ candidate: 'haiku-clauses', firstAudioMs: 1200, fullAudioMs: 2000 }), longestSilenceMs: 600 },
    buildMockReplyRecord({ candidate: 'haiku-clauses', firstAudioMs: 1400, fullAudioMs: 2600 }),
    buildMockReplyRecord({
      candidate: 'haiku-clauses',
      firstAudioMs: 1300,
      fullAudioMs: 3000,
      needsTool: true,
      toolCalls: ['mcp__voice__read_weather'],
    }),
    {
      ...buildMockReplyRecord({
        candidate: 'sonnet-opener',
        costUSD: 0.004,
        firstAudioMs: 900,
        fullAudioMs: 2400,
        gaps: 1,
      }),
      longestSilenceMs: 1400,
    },
    buildMockReplyRecord({
      candidate: 'sonnet-opener',
      costUSD: 0.004,
      firstAudioMs: 1000,
      fullAudioMs: 2500,
      needsTool: true,
    }),
    buildMockReplyRecord({
      candidate: 'sonnet-opener',
      costUSD: 0.002,
      firstAudioMs: undefined,
      fullAudioMs: undefined,
      isError: true,
    }),
  ]);

  expect(report).toMatchInlineSnapshot(`
    "| Candidate | Turns | First audio, median / p90 | Full answer audio, median / p90 | Turns with a gap | Replies with a silence over 1 s | Tool called when needed | Cost per turn | Cost per minute | Failed | Passes |
    | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
    | haiku-clauses | 3 | 1.30 s / 1.40 s | 2.60 s / 3.00 s | 0 (0.0%) | 0 (0.0%) | 1 of 1 | $0.0010 | $0.0100 | 0 | yes |
    | sonnet-opener | 3 | 1.00 s / 1.00 s | 2.50 s / 2.50 s | 1 (50.0%) | 1 (50.0%) | 0 of 1 | $0.0033 | $0.0333 | 1 | no |"
  `);
});
