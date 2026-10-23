import { expect, test } from 'bun:test';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { MemoryStateError } from './memory-state-error';
import { StaleVersionError } from './stale-version-error';
import { tryRunWriterGate } from './try-run-writer-gate';

test('it returns no writes when an item a write retires moved on since the session read it', async () => {
  const gated = await tryRunWriterGate(
    {
      check: () => Promise.reject(new StaleVersionError({ itemID: 'item-a', version: 1 }, 2)),
      release: () => Promise.resolve(),
    },
    [
      {
        op: 'retire',
        quote: 'I moved out',
        sourceSequence: 4,
        target: { itemID: 'item-a', version: 1 },
      },
    ],
    {
      findSource: (sequence) => ({
        sequence,
        text: 'I moved out',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      }),
      isShownText: () => false,
      batch: { bounds: { start: 0, end: 4 }, model: 'claude-writer-1' },
    },
  );

  expect(gated).toBeNull();
});

test('it returns no writes when an item a write retires was retired since the session read it', async () => {
  const gated = await tryRunWriterGate(
    {
      check: () => Promise.reject(new MemoryStateError('item-a', 'retire', 'retired')),
      release: () => Promise.resolve(),
    },
    [
      {
        op: 'retire',
        quote: 'I moved out',
        sourceSequence: 4,
        target: { itemID: 'item-a', version: 1 },
      },
    ],
    {
      findSource: (sequence) => ({
        sequence,
        text: 'I moved out',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      }),
      isShownText: () => false,
      batch: { bounds: { start: 0, end: 4 }, model: 'claude-writer-1' },
    },
  );

  expect(gated).toBeNull();
});

test('it returns no writes when an item a write retires was forgotten since the session read it', async () => {
  const gated = await tryRunWriterGate(
    {
      check: () => Promise.reject(new MemoryItemNotFoundError('item-a')),
      release: () => Promise.resolve(),
    },
    [
      {
        op: 'retire',
        quote: 'I moved out',
        sourceSequence: 4,
        target: { itemID: 'item-a', version: 1 },
      },
    ],
    {
      findSource: (sequence) => ({
        sequence,
        text: 'I moved out',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      }),
      isShownText: () => false,
      batch: { bounds: { start: 0, end: 4 }, model: 'claude-writer-1' },
    },
  );

  expect(gated).toBeNull();
});

test('it throws any other failure of the gate', async () => {
  const gating = tryRunWriterGate(
    {
      check: () => Promise.reject(new Error('the key store is busy')),
      release: () => Promise.resolve(),
    },
    [
      {
        op: 'retire',
        quote: 'I moved out',
        sourceSequence: 4,
        target: { itemID: 'item-a', version: 1 },
      },
    ],
    {
      findSource: (sequence) => ({
        sequence,
        text: 'I moved out',
        spans: [],
        sentAt: Date.parse('2026-10-19T09:00:00Z'),
        timeZone: null,
      }),
      isShownText: () => false,
      batch: { bounds: { start: 0, end: 4 }, model: 'claude-writer-1' },
    },
  );

  await gating.catch(() => {});

  expect(gating).rejects.toThrow('the key store is busy');
});
