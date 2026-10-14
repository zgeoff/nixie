import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { findEventEvidence } from './find-event-evidence';
import { startTestMemory } from './test-utils';
import { removeMessageKey } from './test-utils/remove-message-key';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

test('it finds a quote you typed in the message the event ID names', async () => {
  const memory = await startTestMemory();
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'The lighthouse key hangs by the blue door',
    spans: [{ start: 0, end: 41, source: 'typed' }],
  });

  const found = await findEventEvidence(memory.log, {
    thread: 'conversation',
    quote: 'key hangs by the blue door',
    eventID: sequence,
  });

  expect(found).toStrictEqual({
    status: 'found',
    message: {
      sequence,
      text: 'The lighthouse key hangs by the blue door',
      spans: [{ start: 0, end: 41, source: 'typed' }],
    },
    evidence: { recordSequence: sequence, start: 15, end: 41 },
  });
});

test('it refuses a quote that lies in a pasted span of the message', async () => {
  const memory = await startTestMemory();
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'From the forum: the ferry leaves at noon',
    spans: [
      { start: 0, end: 16, source: 'typed' },
      { start: 16, end: 40, source: 'pasted' },
    ],
  });

  const found = await findEventEvidence(memory.log, {
    thread: 'conversation',
    quote: 'the ferry leaves at noon',
    eventID: sequence,
  });

  expect(found).toStrictEqual({ status: 'review', reason: 'quote_not_typed' });
});

test('it refuses a quote from a fetched page, which no one typed', async () => {
  const memory = await startTestMemory();
  const [page] = await writeRecords(memory.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: { text: 'untrusted' } },
      erasable: { result: { text: 'The owner always flies on Tuesdays' } },
    },
  ]);

  invariant(page);

  const found = await findEventEvidence(memory.log, {
    thread: 'conversation',
    quote: 'The owner always flies on Tuesdays',
    eventID: page.sequence,
  });

  expect(found).toStrictEqual({ status: 'review', reason: 'quote_not_typed' });
});

test('it refuses a quote from a reply', async () => {
  const memory = await startTestMemory();
  const [reply] = await writeRecords(memory.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'You said the orchard opens in May' },
    },
  ]);

  invariant(reply);

  const found = await findEventEvidence(memory.log, {
    thread: 'conversation',
    quote: 'the orchard opens in May',
    eventID: reply.sequence,
  });

  expect(found).toStrictEqual({ status: 'review', reason: 'quote_not_typed' });
});

test("it finds no quote in a message from another task's thread", async () => {
  const memory = await startTestMemory();
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'task-garden',
    text: 'The shed code is 4471',
    spans: [{ start: 0, end: 21, source: 'typed' }],
  });

  const found = await findEventEvidence(memory.log, {
    thread: 'conversation',
    quote: 'The shed code is 4471',
    eventID: sequence,
  });

  expect(found).toStrictEqual({ status: 'review', reason: 'no_quote' });
});

test('it finds no quote at an event ID past the end of the log', async () => {
  const memory = await startTestMemory();

  const found = await findEventEvidence(memory.log, {
    thread: 'conversation',
    quote: 'The shed code is 4471',
    eventID: 99,
  });

  expect(found).toStrictEqual({ status: 'review', reason: 'no_quote' });
});

test('it refuses a message whose text a forget erased', async () => {
  const memory = await startTestMemory();
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'The shed code is 4471',
    spans: [{ start: 0, end: 21, source: 'typed' }],
  });

  await removeMessageKey(memory.log, sequence);

  const found = await findEventEvidence(memory.log, {
    thread: 'conversation',
    quote: 'The shed code is 4471',
    eventID: sequence,
  });

  expect(found).toStrictEqual({ status: 'review', reason: 'forgotten_evidence' });
});
