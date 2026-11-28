import { expect, test } from 'bun:test';
import { buildRuleEntry, buildTestDecisionPoint } from '../test-utils';
import { buildLogExportCall, logExportDeclaration } from './build-log-export-call';

function setupTest() {
  return { call: buildLogExportCall({ path: '/data/out.db', snapshot: 'snapshot-1', at: 1 }) };
}

test('it denies the export under a deny rule on the export effect', async () => {
  const ctx = setupTest();

  const point = buildTestDecisionPoint({
    declaration: logExportDeclaration,
    rules: [buildRuleEntry('no-export', { outcome: 'deny', effects: ['export'] })],
  });

  const decided = await point.decide(ctx.call);

  expect(decided.decision).toMatchObject({
    outcome: 'deny',
    stage: 3,
    rule: { id: 'no-export' },
  });
});

test('it does not deny the export when no rule covers it', async () => {
  const ctx = setupTest();

  const point = buildTestDecisionPoint({
    declaration: logExportDeclaration,
    rules: [buildRuleEntry('no-sends', { outcome: 'deny', effects: ['send'] })],
  });

  const decided = await point.decide(ctx.call);

  expect(decided.decision.outcome).not.toBe('deny');
});
