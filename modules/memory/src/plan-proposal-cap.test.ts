import { expect, test } from 'bun:test';
import { planProposalCap } from './plan-proposal-cap';
import type { GatedWrite } from './write-memory-batch';

test('it publishes every write of a batch within the cap', () => {
  const gated: GatedWrite[] = [
    {
      write: { op: 'remember', text: 'Cello.', quote: 'cello', sourceSequence: 1, target: null },
      verdict: { outcome: 'propose', reason: 'checker', records: [], plan: null },
    },
  ];

  const capped = planProposalCap(
    { proposalCap: 1 },
    { bounds: { start: 0, end: 1 }, entries: [], sources: new Map() },
    gated,
  );

  expect(capped).toStrictEqual({ kind: 'publish', writes: gated, dropped: 0 });
});

test('it splits a batch over the cap with several of your messages', () => {
  const capped = planProposalCap(
    { proposalCap: 1 },
    {
      bounds: { start: 0, end: 4 },
      entries: [
        { sequence: 1, role: 'owner', text: null, spans: [], recordedAt: 0, arrivedAt: null },
        { sequence: 2, role: 'assistant', text: null, spans: [], recordedAt: 0, arrivedAt: null },
        { sequence: 3, role: 'owner', text: null, spans: [], recordedAt: 0, arrivedAt: null },
        { sequence: 4, role: 'assistant', text: null, spans: [], recordedAt: 0, arrivedAt: null },
      ],
      sources: new Map(),
    },
    [
      {
        write: { op: 'remember', text: 'Cello.', quote: 'cello', sourceSequence: 1, target: null },
        verdict: { outcome: 'propose', reason: 'checker', records: [], plan: null },
      },
      {
        write: { op: 'remember', text: 'Vale.', quote: 'Vale', sourceSequence: 3, target: null },
        verdict: { outcome: 'propose', reason: 'checker', records: [], plan: null },
      },
    ],
  );

  expect(capped).toStrictEqual({ kind: 'split', bounds: { start: 0, end: 2 } });
});

test('it keeps the first proposals up to the cap and counts the rest as dropped for one message', () => {
  const applied: GatedWrite = {
    write: { op: 'remember', text: 'Cello.', quote: 'cello', sourceSequence: 1, target: null },
    verdict: {
      outcome: 'apply',
      source: 'owner',
      checks: {},
      evidence: { recordSequence: 1, start: 0, end: 5 },
    },
  };
  const first: GatedWrite = {
    write: { op: 'remember', text: 'Dog.', quote: 'dog', sourceSequence: 1, target: null },
    verdict: { outcome: 'propose', reason: 'checker', records: [], plan: null },
  };
  const second: GatedWrite = {
    write: { op: 'remember', text: 'Cat.', quote: 'cat', sourceSequence: 1, target: null },
    verdict: { outcome: 'propose', reason: 'checker', records: [], plan: null },
  };
  const third: GatedWrite = {
    write: { op: 'remember', text: 'Hen.', quote: 'hen', sourceSequence: 1, target: null },
    verdict: { outcome: 'propose', reason: 'checker', records: [], plan: null },
  };

  const capped = planProposalCap(
    { proposalCap: 1 },
    {
      bounds: { start: 0, end: 2 },
      entries: [
        { sequence: 1, role: 'owner', text: null, spans: [], recordedAt: 0, arrivedAt: null },
        { sequence: 2, role: 'assistant', text: null, spans: [], recordedAt: 0, arrivedAt: null },
      ],
      sources: new Map(),
    },
    [first, applied, second, third],
  );

  expect(capped).toStrictEqual({ kind: 'publish', writes: [first, applied], dropped: 2 });
});
