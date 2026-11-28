import { expect, test } from 'bun:test';
import { buildTestTaskRun } from '../test-utils/build-test-task-run';
import { pickCarriedLimits } from './pick-carried-limits';

test("it carries a raise as the new total less the piece of work's use", () => {
  expect(
    pickCarriedLimits({
      kind: 'raise',
      first: buildTestTaskRun({ limits: { turns: 40, dollars: 10 } }),
      raised: { turns: 60, dollars: 15 },
      used: { turns: 40, dollars: 10 },
    }),
  ).toStrictEqual({ turns: 20, dollars: 5, calls: {} });
});

test("it carries the first task run's limits as the totals when the piece of work has no raise", () => {
  expect(
    pickCarriedLimits({
      kind: 'raise',
      first: buildTestTaskRun({ limits: { turns: 40, dollars: 10 } }),
      raised: null,
      used: { turns: 15, dollars: 4 },
    }),
  ).toStrictEqual({ turns: 25, dollars: 6, calls: {} });
});

test('it carries nothing below zero when the use passes the total', () => {
  expect(
    pickCarriedLimits({
      kind: 'raise',
      first: buildTestTaskRun({ limits: { turns: 40, dollars: 10 } }),
      raised: null,
      used: { turns: 41, dollars: 10.5 },
    }),
  ).toStrictEqual({ turns: 0, dollars: 0, calls: {} });
});

test('it gives a restart the full totals of the newest raise', () => {
  expect(
    pickCarriedLimits({
      kind: 'restart',
      first: buildTestTaskRun({ limits: { turns: 40, dollars: 10 } }),
      raised: { turns: 80, dollars: 20 },
      used: { turns: 80, dollars: 20 },
    }),
  ).toStrictEqual({ turns: 80, dollars: 20, calls: {} });
});

test('it carries no limit on a meter that has none', () => {
  expect(
    pickCarriedLimits({
      kind: 'raise',
      first: buildTestTaskRun({ limits: { turns: 40, dollars: null } }),
      raised: null,
      used: { turns: 15, dollars: 400 },
    }),
  ).toStrictEqual({ turns: 25, dollars: null, calls: {} });
});
