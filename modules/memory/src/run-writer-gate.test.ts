import { expect, mock, test } from 'bun:test';
import { runWriterGate } from './run-writer-gate';
import type { GateVerdict } from './writer-types';

test('it releases the verdicts it gathered when a later check throws', async () => {
  const proposed: GateVerdict = {
    outcome: 'propose',
    reason: 'checker_unsure',
    records: [],
    plan: null,
  };

  const check = mock<() => Promise<GateVerdict>>()
    .mockResolvedValueOnce(proposed)
    .mockRejectedValueOnce(new Error('the checker crashed'));

  const release = mock(() => Promise.resolve());

  const gating = runWriterGate(
    { check, release },
    [
      {
        op: 'remember',
        subject: 'owner',
        text: 'Lives in Oslo',
        quote: 'I live in Oslo',
        sourceSequence: 4,
        target: null,
      },
      {
        op: 'remember',
        subject: 'owner',
        text: 'Plays cello',
        quote: 'I play cello',
        sourceSequence: 5,
        target: null,
      },
    ],
    {
      findSource: (sequence) => ({
        sequence,
        text: 'I live in Oslo and I play cello',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      }),
      isShownText: () => false,
      batch: { bounds: { start: 0, end: 5 }, model: 'claude-writer-1' },
    },
  );

  await gating.catch(() => {});

  expect(gating).rejects.toThrow('the checker crashed');
  expect(release).toHaveBeenCalledExactlyOnceWith([proposed]);
});

test('it skips a write that repeats the text of an item the session was shown', async () => {
  const check = mock(() => Promise.reject(new Error('no write reaches the gate')));

  const gated = await runWriterGate(
    { check, release: () => Promise.resolve() },
    [
      {
        op: 'remember',
        subject: 'owner',
        text: 'Lives in Oslo',
        quote: 'I live in Oslo',
        sourceSequence: 4,
        target: null,
      },
    ],
    {
      findSource: (sequence) => ({
        sequence,
        text: 'I live in Oslo',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      }),
      isShownText: (text) => text === 'Lives in Oslo',
      batch: { bounds: { start: 0, end: 4 }, model: 'claude-writer-1' },
    },
  );

  expect(gated).toStrictEqual([]);
  expect(check).not.toHaveBeenCalled();
});

test('it leaves out a write that the gate drops', async () => {
  const check = mock(() => Promise.resolve(null));

  const gated = await runWriterGate(
    { check, release: () => Promise.resolve() },
    [
      {
        op: 'remember',
        subject: 'owner',
        text: 'I like short answers',
        quote: 'You like short answers',
        sourceSequence: 4,
        target: { itemID: 'item-1', version: 1 },
      },
    ],
    {
      findSource: (sequence) => ({
        sequence,
        text: 'You like short answers',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      }),
      isShownText: () => false,
      batch: { bounds: { start: 0, end: 4 }, model: 'claude-writer-1' },
    },
  );

  expect(gated).toStrictEqual([]);
});
