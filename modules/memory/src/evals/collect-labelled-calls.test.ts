import { expect, test } from 'bun:test';
import { collectLabelledCalls } from './collect-labelled-calls';

test('it joins each call to the pair it checked, on the memory named as the report ran it', () => {
  const pair = {
    asserted: false,
    bucket: 'question',
    memory: 'The owner takes their coffee black.',
    quote: 'do I take my coffee black?',
  };

  const input = new Bun.CryptoHasher('sha256')
    .update(
      '<sent>Mon 19 Oct 2026, 09:00, Europe/London (UTC+01:00)</sent>\n\n' +
        '<owner_message>\n«evidence»do I take my coffee black?«/evidence»\n</owner_message>\n\n' +
        '<candidate_memory>\nSam takes their coffee black.\n</candidate_memory>',
    )
    .digest('hex');

  const call = {
    sample: 'coffee',
    pair: 0,
    repeat: 0,
    input: `sha256:${input}`,
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
              sentAt: '2026-10-19T08:00:00Z',
              timeZone: 'Europe/London',
            },
            pairs: [pair],
          },
        ],
      },
      {
        model: 'claude-sonnet-5-5',
        effort: 'low',
        prompt: 'sha256:0f1e',
        ownerName: 'Sam',
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
        ownerName: null,
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

test('it refuses a report run before the corpus changed the message of a pair', () => {
  expect(() =>
    collectLabelledCalls(
      {
        samples: [
          {
            id: 'coffee',
            message: {
              text: 'do I take my coffee black? I forget.',
              spans: [{ start: 0, end: 36, source: 'typed' }],
              sentAt: '2026-10-19T08:00:00Z',
              timeZone: 'Europe/London',
            },
            pairs: [
              {
                asserted: false,
                bucket: 'question',
                memory: 'The owner takes their coffee black.',
                quote: 'do I take my coffee black?',
              },
            ],
          },
        ],
      },
      {
        model: 'claude-sonnet-5-5',
        effort: 'low',
        prompt: 'sha256:0f1e',
        ownerName: null,
        repeats: 1,
        calls: [
          {
            sample: 'coffee',
            pair: 0,
            repeat: 0,

            input: 'sha256:5d0b1a8e1d3286e241801739bf482b76bedba4b7dc1d0eeada38d01d2f2b0bbb',
            verdict: 'not_asserted',
            reason: 'It is a question.',
            failure: null,
            costUSD: 0.003,
            latencyMs: 4100,
          },
        ],
      },
    ),
  ).toThrowWithMessage(Error, /pair 0 of coffee on an input the corpus no longer renders/u);
});
