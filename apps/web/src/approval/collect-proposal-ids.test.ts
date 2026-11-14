import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { collectProposalIDs } from './collect-proposal-ids';

function setupTest() {
  return {
    buildProposalRecord: (sequence: number, proposalID: string) =>
      buildMockLogRecord({
        sequence,
        proposal: { proposalID, shortID: `s${String(sequence)}` },
      }),
  };
}

test('it collects the proposal of each record that created one, in order', () => {
  const ctx = setupTest();

  const records = [
    ctx.buildProposalRecord(1, 'first'),
    buildMockLogRecord({ sequence: 2 }),
    ctx.buildProposalRecord(3, 'second'),
  ];

  expect(collectProposalIDs(records)).toStrictEqual(['first', 'second']);
});

test('it collects a proposal once', () => {
  const ctx = setupTest();
  const records = [ctx.buildProposalRecord(1, 'first'), ctx.buildProposalRecord(2, 'first')];

  expect(collectProposalIDs(records)).toStrictEqual(['first']);
});

test('it keeps the newest 100 proposals of a longer thread', () => {
  const ctx = setupTest();

  const records = Array.from({ length: 101 }, (_unused, index) =>
    ctx.buildProposalRecord(index + 1, `proposal-${String(index)}`),
  );

  const ids = collectProposalIDs(records);

  expect([ids.length, ids[0], ids.at(-1)]).toStrictEqual([100, 'proposal-1', 'proposal-100']);
});
