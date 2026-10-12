import { expect, test } from 'bun:test';
import { collectLabelledCalls } from './collect-labelled-calls';

test('it joins each call to the pair it checked', () => {
  const pair = {
    asserted: false,
    bucket: 'question',
    memory: 'The owner takes their coffee black.',
    quote: 'do I take my coffee black?',
  };
  const call = {
    sample: 'coffee',
    pair: 0,
    repeat: 0,
    input: 'sha256:a1b2',
    verdict: 'not_asserted' as const,
    reason: 'It is a question.',
    failure: null,
    costUSD: 0.003,
    latencyMs: 4100,
  };

  expect(
    collectLabelledCalls(
      {
        samples: [
          {
            id: 'coffee',
            message: {
              text: 'do I take my coffee black?',
              spans: [{ start: 0, end: 26, source: 'typed' }],
            },
            pairs: [pair],
          },
        ],
      },
      {
        model: 'claude-sonnet-5-5',
        effort: 'low',
        prompt: 'sha256:0f1e',
        repeats: 1,
        calls: [call],
      },
    ),
  ).toStrictEqual([{ call, pair }]);
});

test('it refuses a call for a pair the corpus does not hold', () => {
  expect(() =>
    collectLabelledCalls(
      { samples: [] },
      {
        model: 'claude-sonnet-5-5',
        effort: 'low',
        prompt: 'sha256:0f1e',
        repeats: 1,
        calls: [
          {
            sample: 'coffee',
            pair: 0,
            repeat: 0,
            input: 'sha256:a1b2',
            verdict: 'not_asserted',
            reason: 'It is a question.',
            failure: null,
            costUSD: 0.003,
            latencyMs: 4100,
          },
        ],
      },
    ),
  ).toThrowWithMessage(Error, /pair 0 of coffee, which is not in the corpus/u);
});
