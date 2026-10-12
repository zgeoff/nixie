import { expect, test } from 'bun:test';
import { buildStubGate } from './build-stub-gate';

test('it applies a write whose quote is in its source, with the quote as the evidence', async () => {
  const gate = buildStubGate();

  const verdict = await gate.check(
    {
      op: 'remember',
      text: 'You live at 4 Elm Row.',
      quote: '4 Elm Row',
      sourceSequence: 12,
      target: null,
    },
    { sequence: 12, text: 'I moved to 4 Elm Row.', spans: [] },
  );

  expect(verdict).toStrictEqual({
    outcome: 'apply',
    source: 'owner',
    checks: { quote: 'exact' },
    evidence: { recordSequence: 12, start: 11, end: 20 },
  });
});

test('it holds a write whose quote is not in its source as a proposal', async () => {
  const gate = buildStubGate();

  const verdict = await gate.check(
    {
      op: 'remember',
      text: 'You live at 4 Elm Row.',
      quote: '9 Oak Lane',
      sourceSequence: 12,
      target: null,
    },
    { sequence: 12, text: 'I moved to 4 Elm Row.', spans: [] },
  );

  expect(verdict).toStrictEqual({
    outcome: 'propose',
    reason: 'the quote is not in its source',
    records: [
      {
        kind: 'test.proposal',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'memory-writer',
        payload: { sourceSequence: 12 },
      },
    ],
  });
});

test('it holds a write with an empty quote as a proposal', async () => {
  const gate = buildStubGate();

  const verdict = await gate.check(
    {
      op: 'retire',
      quote: '',
      sourceSequence: 12,
      target: { itemID: 'item-a', version: 1 },
    },
    { sequence: 12, text: 'I moved to 4 Elm Row.', spans: [] },
  );

  expect(verdict.outcome).toBe('propose');
});
