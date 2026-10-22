import { expect, mock, test } from 'bun:test';
import { SelfNoteError } from './self-note-error';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

test('it proposes a self-note with the self-note reason, even when typed words back it and the checker asserts it', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'You always end a long answer with a short summary line',
    spans: [{ start: 0, end: 55, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'I like ending a long answer with a short summary line',
    quote: 'You always end a long answer with a short summary line',
    subject: 'self',
    caller: buildMockWriteCaller(),
  });

  const rows = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'subject', 'checks', 'evidence', 'is_new_item'])
    .execute();

  expect(outcome).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason: 'self_note',
    merged: false,
  });

  expect(rows).toStrictEqual([
    {
      review_reason: 'self_note',
      subject: 'self',
      checks: JSON.stringify({ tokens: 'pass' }),
      evidence: null,
      is_new_item: 1,
    },
  ]);

  expect(check).not.toHaveBeenCalled();
});

test('it proposes a self-note that holds a link you never typed with the self-note reason and a failed token check', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'That recipe tip landed well',
    spans: [{ start: 0, end: 27, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'I enjoy sharing recipes from https://recipes.example/stew',
    subject: 'self',
    caller: buildMockWriteCaller(),
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'checks'])
    .executeTakeFirstOrThrow();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });

  expect(row).toStrictEqual({
    review_reason: 'self_note',
    checks: JSON.stringify({ tokens: 'fail' }),
  });
});

test('it proposes an edit of a self-note with the self-note reason, though the edit asks for a fact', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const memory = await startTestMemory({ gate: { check } });

  const note = await memory.store.remember({
    text: 'I like short answers in the morning',
    subject: 'self',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I like short answers in the evening too',
    spans: [{ start: 0, end: 39, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'I like short answers in the morning and the evening',
    quote: 'I like short answers in the evening too',
    target: note,
    subject: 'owner',
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });
  expect(pending).toMatchObject([{ subject: 'self', targetVersion: 1 }]);
  expect(check).not.toHaveBeenCalled();
});

test('it proposes a fact mislabelled as a self-note with the self-note reason', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'The boiler service is on Thursday',
    spans: [{ start: 0, end: 33, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'The boiler service is on Thursday',
    quote: 'The boiler service is on Thursday',
    subject: 'self',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });
  expect(check).not.toHaveBeenCalled();
});

test('it proposes a self-note mislabelled as a fact when it quotes typed words that do not state it', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'not_asserted' })));

  const memory = await startTestMemory({ gate: { check } });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Thanks, that summary helped',
    spans: [{ start: 0, end: 27, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'I like ending long answers with a short summary',
    quote: 'that summary helped',
    subject: 'owner',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'checker_not_asserted' });
});

test('it proposes a self-note mislabelled as a fact when it cites no quote', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I prefer a calm tone when the owner is stressed',
    subject: 'owner',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it refuses a self-note from the memory writer, and writes nothing', async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'I like tidy lists',
    subject: 'self',
    caller: buildMockWriteCaller({ origin: 'memory_writer', thread: 'memory-writer' }),
  });

  await Promise.allSettled([write]);

  const db = memory.writer.db.$extendTables<MemoryTables>();

  const proposals = await db.selectFrom('memory_proposals').select('proposal_id').execute();
  const items = await db.selectFrom('memory_items').select('item_id').execute();

  expect(write).rejects.toThrowWithMessage(
    SelfNoteError,
    'only the conversation writes a self-note, and this write came from the memory_writer',
  );

  expect(proposals).toStrictEqual([]);
  expect(items).toStrictEqual([]);
});

test('it refuses a self-note from a task, and writes nothing', async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'I like tidy lists',
    subject: 'self',
    caller: buildMockWriteCaller({ origin: 'task', thread: 'task-1', taskID: 'task-1' }),
  });

  await Promise.allSettled([write]);

  const pending = await memory.store.proposals.listPending();

  expect(write).rejects.toThrowWithMessage(
    SelfNoteError,
    'only the conversation writes a self-note, and this write came from the task',
  );

  expect(pending).toStrictEqual([]);
});

test('it refuses the note-taker an edit of a self-note, and writes nothing', async () => {
  const memory = await startTestMemory();

  const note = await memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    provenance: {
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const write = memory.store.writes.remember({
    text: 'I like tidy lists with short items',
    target: note,
    caller: buildMockWriteCaller({ origin: 'memory_writer', taskID: 'memory-writer' }),
  });

  await Promise.allSettled([write]);

  const pending = await memory.store.proposals.listPending();

  expect(write).rejects.toThrowWithMessage(SelfNoteError, 'the note-taker never edits a self-note');
  expect(pending).toStrictEqual([]);
});

test('it sends a shared item with no quote to review, as it does an item about the owner', async () => {
  const memory = await startTestMemory();

  const shared = await memory.store.writes.remember({
    text: 'The owner and the assistant call Mondays "launch day"',
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const owner = await memory.store.writes.remember({
    text: 'The owner starts new projects on Mondays',
    caller: buildMockWriteCaller(),
  });

  expect(shared).toMatchObject({ status: 'proposed', reason: 'no_quote' });
  expect(owner).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it applies a shared item that a quote of your own typed words backs, as a shared item', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: "Let's call Mondays launch day from now on",
    spans: [{ start: 0, end: 41, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: 'The owner and the assistant call Mondays "launch day"',
    quote: "Let's call Mondays launch day",
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  if (outcome.status !== 'applied') {
    throw new Error(`the write did not apply: ${outcome.status}`);
  }

  const recalled = await memory.store.recall({ itemIDs: [outcome.itemID] });

  expect(recalled.items).toMatchObject([{ subject: 'shared', source: 'owner' }]);
});
