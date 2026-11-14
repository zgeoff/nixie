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
  };
}

test('it renders the shape block with the first 4 digits of the run ID as its fence at the first step', () => {
  const ctx = setupTest();

  expect(renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:1', isNewSession: false })).toBe(
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

  expect(renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:7', isNewSession: true })).toBe(
    renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:1', isNewSession: false }),
  );
});

test('it renders nothing at a later step of a session that holds the block', () => {
  const ctx = setupTest();

  expect(renderRunBlocks(ctx.shaped, { stepKey: 'tide-tables:2', isNewSession: false })).toBeNull();
});

test('it renders nothing at the first step of a carried task run, whose resumed session holds the block', () => {
  const ctx = setupTest();

  expect(
    renderRunBlocks(ctx.carried, { stepKey: 'tide-tables:1', isNewSession: false }),
  ).toBeNull();
});

test('it renders the block in the rebuilt session of a carried task run', () => {
  const ctx = setupTest();

  expect(renderRunBlocks(ctx.carried, { stepKey: 'tide-tables:5', isNewSession: true })).toContain(
    '<report-shape fence="k3f9">',
  );
});

test('it renders no block for a task run with no report shape', () => {
  const ctx = setupTest();

  expect(renderRunBlocks(ctx.base, { stepKey: 'tide-tables:1', isNewSession: true })).toBeNull();
});
