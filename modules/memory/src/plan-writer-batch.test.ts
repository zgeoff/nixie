import { expect, test } from 'bun:test';
import { planWriterBatch } from './plan-writer-batch';
import { writerConfigSchema } from './writer-config-schema';

test('it plans a full batch at once, cut at the batch size', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [
      { sequence: 11, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 12, isOwner: false, tokens: 10, arrivedAt: null },
      { sequence: 13, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 14, isOwner: false, tokens: 10, arrivedAt: null },
      { sequence: 15, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
    ],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 2 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 10, end: 14 }, mode: 'live' });
});

test('it waits for the idle time after a short batch', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [{ sequence: 11, isOwner: true, tokens: 10, arrivedAt: 1_000_000 }],
    now: 1_000_000 + 60_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4, idle_minutes: 5 }),
  });

  expect(plan).toStrictEqual({ kind: 'wait', wakeAt: 1_000_000 + 300_000 });
});

test('it plans a short batch once the conversation goes idle', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [
      { sequence: 11, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 12, isOwner: false, tokens: 10, arrivedAt: null },
    ],
    now: 1_000_000 + 300_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4, idle_minutes: 5 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 10, end: 12 }, mode: 'live' });
});

test('it wakes at the maximum age of the oldest message when that comes before the idle time', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [
      { sequence: 11, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 13, isOwner: true, tokens: 10, arrivedAt: 1_000_000 + 18 * 60_000 },
    ],
    now: 1_000_000 + 19 * 60_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4, idle_minutes: 5, max_age_minutes: 20 }),
  });

  expect(plan).toStrictEqual({ kind: 'wait', wakeAt: 1_000_000 + 20 * 60_000 });
});

test('it plans a batch at once for a message from before the writer watched', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [{ sequence: 11, isOwner: true, tokens: 10, arrivedAt: null }],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 10, end: 11 }, mode: 'live' });
});

test('it holds a due batch until the pace limit after the last batch', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [
      { sequence: 11, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 12, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
    ],
    now: 1_000_000,
    lastBatchAt: 1_000_000 - 1000,
    config: writerConfigSchema.parse({ batch_messages: 2, batches_per_hour: 300 }),
  });

  expect(plan).toStrictEqual({ kind: 'wait', wakeAt: 1_000_000 - 1000 + 12_000 });
});

test('it plans a batch once the pace limit has passed', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [
      { sequence: 11, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 12, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
    ],
    now: 1_000_000,
    lastBatchAt: 1_000_000 - 12_000,
    config: writerConfigSchema.parse({ batch_messages: 2, batches_per_hour: 300 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 10, end: 12 }, mode: 'live' });
});

test('it ends the catch-up at the start sequence when none of your earlier messages wait', () => {
  const plan = planWriterBatch({
    cursor: 3,
    startSequence: 8,
    messages: [
      { sequence: 4, isOwner: false, tokens: 10, arrivedAt: null },
      { sequence: 9, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 10, isOwner: false, tokens: 10, arrivedAt: null },
    ],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 3, end: 8 }, mode: 'catch_up' });
});

test('it plans a catch-up batch for your messages from before memory started', () => {
  const plan = planWriterBatch({
    cursor: 3,
    startSequence: 8,
    messages: [
      { sequence: 4, isOwner: true, tokens: 10, arrivedAt: null },
      { sequence: 5, isOwner: false, tokens: 10, arrivedAt: null },
    ],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 3, end: 5 }, mode: 'catch_up' });
});

test('it stops a catch-up batch at the start sequence, before your live messages', () => {
  const plan = planWriterBatch({
    cursor: 3,
    startSequence: 5,
    messages: [
      { sequence: 4, isOwner: true, tokens: 10, arrivedAt: null },
      { sequence: 5, isOwner: false, tokens: 10, arrivedAt: null },
      { sequence: 6, isOwner: true, tokens: 10, arrivedAt: 1_000_000 },
      { sequence: 7, isOwner: false, tokens: 10, arrivedAt: null },
    ],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 3, end: 5 }, mode: 'catch_up' });
});

test('it starts the next batch at a turn that would pass the token budget', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [
      { sequence: 11, isOwner: true, tokens: 80, arrivedAt: null },
      { sequence: 12, isOwner: false, tokens: 10, arrivedAt: null },
      { sequence: 13, isOwner: true, tokens: 20, arrivedAt: null },
      { sequence: 14, isOwner: false, tokens: 10, arrivedAt: null },
    ],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4, batch_tokens: 100 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 10, end: 12 }, mode: 'live' });
});

test('it takes a first turn over the token budget whole', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [
      { sequence: 11, isOwner: true, tokens: 500, arrivedAt: null },
      { sequence: 12, isOwner: false, tokens: 300, arrivedAt: null },
      { sequence: 13, isOwner: true, tokens: 10, arrivedAt: null },
    ],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({ batch_messages: 4, batch_tokens: 100 }),
  });

  expect(plan).toStrictEqual({ kind: 'batch', bounds: { start: 10, end: 12 }, mode: 'live' });
});

test('it waits for the next message when only replies follow the cursor', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 5,
    messages: [{ sequence: 11, isOwner: false, tokens: 10, arrivedAt: null }],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({}),
  });

  expect(plan).toStrictEqual({ kind: 'wait', wakeAt: null });
});

test('it waits for the next message when nothing follows the cursor', () => {
  const plan = planWriterBatch({
    cursor: 10,
    startSequence: 10,
    messages: [],
    now: 1_000_000,
    lastBatchAt: null,
    config: writerConfigSchema.parse({}),
  });

  expect(plan).toStrictEqual({ kind: 'wait', wakeAt: null });
});
