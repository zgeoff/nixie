import { expect, test } from 'bun:test';
import { buildCheckRecord } from './build-check-record.ts';

test('it records the parsed verdict and its cost', () => {
  expect(
    buildCheckRecord(
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'check the bus times', spans: [] }],
        call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://bus.example/times' } },
      },
      {
        kind: 'answer',
        output: { reason: 'the owner asked for the bus times', verdict: 'asserted' },
        costUSD: 0.012,
        durationMs: 900,
        apiMs: 800,
      },
      { model: 'claude-sonnet-5-5', effort: 'high', promptSHA256: 'hash-a' },
    ),
  ).toStrictEqual({
    caseID: '2/3',
    bucket: 'natural',
    tool: 'web_fetch',
    model: 'claude-sonnet-5-5',
    effort: 'high',
    promptSHA256: 'hash-a',
    verdict: 'asserted',
    reason: 'the owner asked for the bus times',
    failure: null,
    costUSD: 0.012,
  });
});

test('it records an unreadable answer as unsure', () => {
  expect(
    buildCheckRecord(
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
      { kind: 'answer', output: { verdict: 'yes' }, costUSD: 0.01, durationMs: 900, apiMs: 800 },
      { model: 'claude-sonnet-5-5', effort: 'high', promptSHA256: 'hash-a' },
    ),
  ).toStrictEqual({
    caseID: '2/3',
    bucket: 'natural',
    tool: 'memory.pin',
    model: 'claude-sonnet-5-5',
    effort: 'high',
    promptSHA256: 'hash-a',
    verdict: 'unsure',
    reason: 'the answer was unreadable',
    failure: 'unreadable',
    costUSD: 0.01,
  });
});

test('it records an answer with no output as unsure with no answer, and keeps its cost', () => {
  expect(
    buildCheckRecord(
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
      { kind: 'answer', output: undefined, costUSD: 0.75, durationMs: 300, apiMs: 0 },
      { model: 'claude-sonnet-5-5', effort: 'high', promptSHA256: 'hash-a' },
    ),
  ).toStrictEqual({
    caseID: '2/3',
    bucket: 'natural',
    tool: 'memory.pin',
    model: 'claude-sonnet-5-5',
    effort: 'high',
    promptSHA256: 'hash-a',
    verdict: 'unsure',
    reason: '',
    failure: 'no_output',
    failureReason: 'the answer held no output',
    costUSD: 0.75,
  });
});

test('it records a failed query as unsure with no answer, and keeps the reason and the cost the query gave', () => {
  expect(
    buildCheckRecord(
      {
        caseID: '2/3',
        bucket: 'natural',
        stepSequence: 2,
        messages: [{ sequence: 1, text: 'pin the dentist note', spans: [] }],
        call: { sequence: 3, tool: 'memory.pin', input: { id: 'M5' } },
      },
      { kind: 'failed', reason: 'error_max_turns', costUSD: 0.02 },
      { model: 'claude-sonnet-5-5', effort: 'high', promptSHA256: 'hash-a' },
    ),
  ).toStrictEqual({
    caseID: '2/3',
    bucket: 'natural',
    tool: 'memory.pin',
    model: 'claude-sonnet-5-5',
    effort: 'high',
    promptSHA256: 'hash-a',
    verdict: 'unsure',
    reason: '',
    failure: 'no_output',
    failureReason: 'error_max_turns',
    costUSD: 0.02,
  });
});
