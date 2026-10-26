import { expect, test } from 'bun:test';
import { buildLabels } from './build-labels.ts';

test('it takes the labeller label for each pair and drops the pairs it was unsure of', () => {
  expect(
    buildLabels([
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
    ]),
  ).toStrictEqual({
    labels: [
      { caseID: '7/8', isAsked: true },
      { caseID: '7/9', isAsked: false },
    ],
    unsure: 1,
  });
});
