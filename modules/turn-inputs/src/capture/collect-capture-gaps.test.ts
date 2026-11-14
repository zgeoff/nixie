import { expect, test } from 'bun:test';
import { collectCaptureGaps } from './collect-capture-gaps';

function setupTest() {
  return {
    held: (writer: string, ...counters: number[]) =>
      counters.map((counter) => ({ writer, counter, span: 1 })),
  };
}

test('it finds no gap in a run from 1', () => {
  const ctx = setupTest();

  expect(collectCaptureGaps(ctx.held('aa', 1, 2, 3), [])).toStrictEqual({
    gaps: [],
    reachedTotal: 3,
  });
});

test('it finds one gap for each run of missing counters', () => {
  const ctx = setupTest();

  expect(collectCaptureGaps(ctx.held('aa', 2, 5, 6), []).gaps).toStrictEqual([
    { writer: 'aa', counter: 1, count: 1 },
    { writer: 'aa', counter: 3, count: 2 },
  ]);
});

test('it keeps each writer apart', () => {
  const ctx = setupTest();
  const covered = [...ctx.held('aa', 1, 3), ...ctx.held('bb', 1, 2)];

  expect(collectCaptureGaps(covered, []).gaps).toStrictEqual([
    { writer: 'aa', counter: 2, count: 1 },
  ]);
});

test('it counts a part file that never finished as a gap', () => {
  const ctx = setupTest();

  expect(collectCaptureGaps(ctx.held('aa', 1), ctx.held('aa', 2))).toStrictEqual({
    gaps: [{ writer: 'aa', counter: 2, count: 1 }],
    reachedTotal: 2,
  });
});

test('it takes a miss for a whole run as covering the run', () => {
  const ctx = setupTest();

  const covered = [
    ...ctx.held('aa', 1),
    { writer: 'aa', counter: 2, span: 3 },
    ...ctx.held('aa', 5),
  ];

  expect(collectCaptureGaps(covered, [])).toStrictEqual({ gaps: [], reachedTotal: 5 });
});

test('it sums the highest counter of each writer', () => {
  const ctx = setupTest();
  const covered = [...ctx.held('aa', 1, 2), ...ctx.held('bb', 1)];

  expect(collectCaptureGaps(covered, []).reachedTotal).toBe(3);
});
