import { expect, test } from 'bun:test';
import { scoreMessageFloors } from './score-message-floors.ts';

test('it counts the shown past messages each floor keeps and the share of named ones among them', () => {
  expect(
    scoreMessageFloors(
      [
        { similarity: 0.62, isHelpful: true },
        { similarity: 0.41, isHelpful: false },
        { similarity: 0.47, isHelpful: false },
        { similarity: 0.39, isHelpful: true },
      ],
      [0.38, 0.45],
    ),
  ).toStrictEqual([
    { floor: 0.38, kept: 4, keptHelpful: 2, precision: 0.5, helpfulKept: 1 },
    { floor: 0.45, kept: 2, keptHelpful: 1, precision: 0.5, helpfulKept: 0.5 },
  ]);
});

test('it scores a floor that keeps nothing as zero', () => {
  expect(scoreMessageFloors([{ similarity: 0.4, isHelpful: false }], [0.6])).toStrictEqual([
    { floor: 0.6, kept: 0, keptHelpful: 0, precision: 0, helpfulKept: 0 },
  ]);
});
