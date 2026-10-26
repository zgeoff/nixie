import { expect, test } from 'bun:test';
import { buildLabelFingerprint } from './build-label-fingerprint.ts';

test('it gives the same turn the same SHA-256 hex fingerprint', () => {
  const first = buildLabelFingerprint({
    stepSequence: 7,
    earlier: [],
    messages: [{ sequence: 6, text: 'pin it', spans: [] }],
    calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
  });

  const second = buildLabelFingerprint({
    stepSequence: 7,
    earlier: [],
    messages: [{ sequence: 6, text: 'pin it', spans: [] }],
    calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
  });

  expect(first).toMatch(/^[0-9a-f]{64}$/u);
  expect(second).toBe(first);
});

test('it gives a turn with another exchange before it another fingerprint', () => {
  const before = buildLabelFingerprint({
    stepSequence: 7,
    earlier: [],
    messages: [{ sequence: 6, text: 'pin it', spans: [] }],
    calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
  });

  const after = buildLabelFingerprint({
    stepSequence: 7,
    earlier: [{ role: 'assistant', text: 'Shall I pin the shed note?' }],
    messages: [{ sequence: 6, text: 'pin it', spans: [] }],
    calls: [{ caseID: '7/9', tool: 'memory.pin', input: { id: 'M3' } }],
  });

  expect(after).not.toBe(before);
});
