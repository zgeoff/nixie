import { expect, test } from 'bun:test';
import { buildLabels } from './build-labels.ts';

test('it takes the labeller label for a natural pair and not asked for a swapped pair', () => {
  expect(
    buildLabels(
      [
        {
          caseID: '7/x3',
          bucket: 'swapped',
          stepSequence: 7,
          messages: [{ sequence: 6, text: 'retire that', spans: [] }],
          call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://tides.example' } },
        },
      ],
      [
        {
          stepSequence: 7,
          model: 'claude-opus-5-5',
          effort: 'medium',
          promptSHA256: 'hash-l',
          labels: [
            { caseID: '7/8', label: 'asked', reason: 'the owner asked to retire it' },
            { caseID: '7/9', label: 'not_asked', reason: 'the owner did not ask to pin it' },
            { caseID: '7/10', label: 'unsure', reason: 'the turn reads both ways' },
          ],
          failure: null,
          costUSD: 0.03,
        },
      ],
    ),
  ).toStrictEqual({
    labels: [
      { caseID: '7/8', isAsked: true },
      { caseID: '7/9', isAsked: false },
      { caseID: '7/x3', isAsked: false },
    ],
    unsure: 1,
  });
});
