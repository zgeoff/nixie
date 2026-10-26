import { expect, test } from 'bun:test';
import { buildCheckFingerprint } from './build-check-fingerprint.ts';

test('it gives the same case the same SHA-256 hex fingerprint', () => {
  const first = buildCheckFingerprint({
    caseID: '2/3',
    bucket: 'natural',
    stepSequence: 2,
    messages: [{ sequence: 1, text: 'look up the ferry times', spans: [] }],
    call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://ferry.example/times' } },
  });

  const second = buildCheckFingerprint({
    caseID: '2/3',
    bucket: 'natural',
    stepSequence: 2,
    messages: [{ sequence: 1, text: 'look up the ferry times', spans: [] }],
    call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://ferry.example/times' } },
  });

  expect(first).toMatch(/^[0-9a-f]{64}$/u);
  expect(second).toBe(first);
});

test('it gives a case with another message under the same ID another fingerprint', () => {
  const before = buildCheckFingerprint({
    caseID: '2/3',
    bucket: 'natural',
    stepSequence: 2,
    messages: [{ sequence: 1, text: 'look up the ferry times', spans: [] }],
    call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://ferry.example/times' } },
  });

  const after = buildCheckFingerprint({
    caseID: '2/3',
    bucket: 'natural',
    stepSequence: 2,
    messages: [
      { sequence: 1, text: 'look up the ferry times', spans: [] },
      { sequence: 2, text: 'actually, never mind', spans: [] },
    ],
    call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://ferry.example/times' } },
  });

  expect(after).not.toBe(before);
});

test('it gives a case with another call input under the same ID another fingerprint', () => {
  const before = buildCheckFingerprint({
    caseID: '2/3',
    bucket: 'natural',
    stepSequence: 2,
    messages: [{ sequence: 1, text: 'look up the ferry times', spans: [] }],
    call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://ferry.example/times' } },
  });

  const after = buildCheckFingerprint({
    caseID: '2/3',
    bucket: 'natural',
    stepSequence: 2,
    messages: [{ sequence: 1, text: 'look up the ferry times', spans: [] }],
    call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://ferry.example/winter' } },
  });

  expect(after).not.toBe(before);
});
