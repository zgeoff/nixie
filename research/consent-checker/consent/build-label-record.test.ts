import { expect, test } from 'bun:test';
import { buildLabelRecord } from './build-label-record.ts';

test('it maps each numbered answer to its pair and marks a pair the answer left out as unsure', () => {
  expect(
    buildLabelRecord(
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'save that the plumber comes Thursday', spans: [] }],
        calls: [
          { caseID: '7/8', tool: 'memory.remember', input: { text: 'The plumber comes Thursday' } },
          { caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } },
        ],
      },
      {
        kind: 'answer',
        output: { calls: [{ call: 1, reason: 'the owner asked to save it', label: 'asked' }] },
        costUSD: 0.03,
        durationMs: 4000,
        apiMs: 3800,
      },
      { model: 'claude-opus-5-5', effort: 'medium', promptSHA256: 'hash-l' },
    ),
  ).toStrictEqual({
    stepSequence: 7,
    model: 'claude-opus-5-5',
    effort: 'medium',
    promptSHA256: 'hash-l',
    labels: [
      { caseID: '7/8', label: 'asked', reason: 'the owner asked to save it' },
      { caseID: '7/9', label: 'unsure', reason: 'the answer left this call out' },
    ],
    failure: null,
    costUSD: 0.03,
  });
});

test('it labels every pair of a turn unsure when the answer is unreadable', () => {
  expect(
    buildLabelRecord(
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
      { kind: 'answer', output: { calls: 'none' }, costUSD: 0.02, durationMs: 900, apiMs: 800 },
      { model: 'claude-opus-5-5', effort: 'medium', promptSHA256: 'hash-l' },
    ),
  ).toStrictEqual({
    stepSequence: 7,
    model: 'claude-opus-5-5',
    effort: 'medium',
    promptSHA256: 'hash-l',
    labels: [{ caseID: '7/9', label: 'unsure', reason: 'the answer was unreadable' }],
    failure: 'unreadable',
    costUSD: 0.02,
  });
});

test('it gives an answer with no output no label and keeps its cost', () => {
  expect(
    buildLabelRecord(
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
      { kind: 'answer', output: undefined, costUSD: 0.4, durationMs: 300, apiMs: 0 },
      { model: 'claude-opus-5-5', effort: 'medium', promptSHA256: 'hash-l' },
    ),
  ).toStrictEqual({
    stepSequence: 7,
    model: 'claude-opus-5-5',
    effort: 'medium',
    promptSHA256: 'hash-l',
    labels: [],
    failure: 'no_output',
    failureReason: 'the answer held no output',
    costUSD: 0.4,
  });
});

test('it gives a failed query no label and keeps the reason the query gave', () => {
  expect(
    buildLabelRecord(
      {
        stepSequence: 7,
        earlier: [],
        messages: [{ sequence: 6, text: 'pin it', spans: [] }],
        calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
      },
      { kind: 'failed', reason: 'error_max_turns' },
      { model: 'claude-opus-5-5', effort: 'medium', promptSHA256: 'hash-l' },
    ),
  ).toStrictEqual({
    stepSequence: 7,
    model: 'claude-opus-5-5',
    effort: 'medium',
    promptSHA256: 'hash-l',
    labels: [],
    failure: 'no_output',
    failureReason: 'error_max_turns',
    costUSD: 0,
  });
});
