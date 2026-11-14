import { expect, test } from 'bun:test';
import { planTaskReport } from './plan-task-report';

test.each([
  ['wake', { status: 'planned', wake: true }],
  ['next_turn', { status: 'planned', wake: false }],
  ['none', { status: 'refused' }],
] as const)('it plans a report to the starter of a task started with report %s', (report, plan) => {
  expect(
    planTaskReport(
      {
        startedBy: 'conversation',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: ['tasks.list', 'task.message'],
          report,
          limits: { turns: 25, dollars: 2 },
        },
        limits: { turns: 25, dollars: 2 },
      },
      { to: 'conversation', kind: 'report', wake: undefined },
    ),
  ).toStrictEqual(plan);
});

test('it keeps the wake that a report to a task other than the starter asks for', () => {
  expect(
    planTaskReport(
      {
        startedBy: 'conversation',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: ['tasks.list', 'task.message'],
          report: 'none',
          limits: { turns: 25, dollars: 2 },
        },
        limits: { turns: 25, dollars: 2 },
      },
      { to: 'garden-plan', kind: 'report', wake: false },
    ),
  ).toStrictEqual({ status: 'planned', wake: false });
});

test('it plans a progress message to the starter with the wake it asks for', () => {
  expect(
    planTaskReport(
      {
        startedBy: 'conversation',
        options: {
          model: null,
          profile: null,
          persona: 'none',
          memory: 'none',
          tools: ['tasks.list', 'task.message'],
          report: 'none',
          limits: { turns: 25, dollars: 2 },
        },
        limits: { turns: 25, dollars: 2 },
      },
      { to: 'conversation', kind: 'progress', wake: undefined },
    ),
  ).toStrictEqual({ status: 'planned', wake: true });
});

test('it plans a report from a task that the user started, which holds no options, as a wake', () => {
  expect(
    planTaskReport(
      { startedBy: 'conversation', options: null, limits: null },
      { to: 'conversation', kind: 'report', wake: undefined },
    ),
  ).toStrictEqual({ status: 'planned', wake: true });
});
