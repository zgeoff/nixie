import { expect, test } from 'bun:test';
import { buildTestTaskRun } from '@heynixie/tasks/test-utils';
import { renderRunBlocks } from './render-run-blocks';

function setupTest() {
  const shape = {
    type: 'object',
    additionalProperties: false,
    properties: { city: { type: 'string' } },
    required: ['city'],
  } as const;

  const base = buildTestTaskRun({ runID: 'k3f9c2d4-0000-0000-0000-000000000000' });

  return {
    shaped: { ...base, opened: { ...base.opened, reportShape: shape } },
    carried: {
      ...base,
      opened: { ...base.opened, reportShape: shape, carriesRunID: 'earlier-run' },
    },
    base,
    trigger: {
      zone: 'Australia/Sydney',
      details: {
        kind: 'schedule' as const,
        scheduledFor: '2026-06-04T06:30:00+10:00',
        startedAt: '2026-06-04T08:15:00+10:00',
        isCatchUp: true,
        skipped: ['2026-06-03T06:30:00+10:00'],
        skippedCount: 1,
        sentence:
          'This task run was scheduled for Thu 4 Jun, 06:30 and started at 08:15 as a catch-up. Skipped: Wed 3 Jun, 06:30.',
      },
    },
  };
}

test('it renders the shape block with the first 4 digits of the run ID as its fence at the first step', () => {
  const ctx = setupTest();

  expect(renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:1', isNewSession: false }, null)).toBe(
    [
      '<report-shape fence="k3f9">',
      'End this run with task.report. Beside summary, pass fields that match this schema:',
      '{"type":"object","additionalProperties":false,"properties":{"city":{"type":"string"}},"required":["city"]}',
      '</report-shape fence="k3f9">',
    ].join('\n'),
  );
});

test('it renders the same block in a rebuilt session as at the first step', () => {
  const ctx = setupTest();

  expect(renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:7', isNewSession: true }, null)).toBe(
    renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:1', isNewSession: false }, null),
  );
});

test('it renders nothing at a later step of a session that holds the block', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:2', isNewSession: false }, null),
  ).toBeNull();
});

test('it renders nothing at the first step of a carried task run, whose resumed session holds the block', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.carried, { stepKey: 'tide-tables:1', isNewSession: false }, null),
  ).toBeNull();
});

test('it renders the block in the rebuilt session of a carried task run', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.carried, { stepKey: 'tide-tables:5', isNewSession: true }, null),
  ).toContain('<report-shape fence="k3f9">');
});

test('it renders no block for a task run with no report shape', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.base, { stepKey: 'tide-tables:1', isNewSession: true }, null),
  ).toBeNull();
});

test('it renders the trigger block with its zone for a fire', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.base, { stepKey: 'tide-tables:1', isNewSession: false }, ctx.trigger),
  ).toBe(
    [
      '<input name="trigger">',
      'This task run was scheduled for Thu 4 Jun, 06:30 and started at 08:15 as a catch-up. Skipped: Wed 3 Jun, 06:30. Times are in Australia/Sydney.',
      '</input>',
    ].join('\n'),
  );
});

test('it renders the trigger block before the report shape', () => {
  const ctx = setupTest();

  const blocks = renderRunBlocks(
    ctx.shaped,
    { stepKey: 'tide-tables:1', isNewSession: false },
    ctx.trigger,
  );

  expect(blocks).toStartWith('<input name="trigger">');
  expect(blocks).toContain('</input>\n<report-shape fence="k3f9">');
});

test('it renders the trigger block in the rebuilt session of a carried task run', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.carried, { stepKey: 'tide-tables:5', isNewSession: true }, ctx.trigger),
  ).toStartWith('<input name="trigger">');
});

test('it renders no trigger block at a later step of a session that holds it', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.base, { stepKey: 'tide-tables:2', isNewSession: false }, ctx.trigger),
  ).toBeNull();
});
