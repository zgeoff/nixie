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
    itemKind: 'self',
    caller: buildMockWriteCaller(),
  });

  const rows = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select(['review_reason', 'kind', 'checks', 'evidence', 'is_new_item'])
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
      kind: 'self',
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
    itemKind: 'self',
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
    itemKind: 'self',
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
    itemKind: 'fact',
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'self_note' });
  expect(pending).toMatchObject([{ kind: 'self', targetVersion: 1 }]);
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
    itemKind: 'self',
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
    itemKind: 'fact',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'checker_not_asserted' });
});

test('it proposes a self-note mislabelled as a fact when it cites no quote', async () => {
  const memory = await startTestMemory();

  const outcome = await memory.store.writes.remember({
    text: 'I prefer a calm tone when the owner is stressed',
    itemKind: 'fact',
    caller: buildMockWriteCaller(),
  });

  expect(outcome).toMatchObject({ status: 'proposed', reason: 'no_quote' });
});

test('it refuses a self-note from the memory writer, and writes nothing', async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'I like tidy lists',
    itemKind: 'self',
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
    itemKind: 'self',
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

test('it refuses a self-note that asks for a pin, and writes nothing', async () => {
  const memory = await startTestMemory();

  const write = memory.store.writes.remember({
    text: 'I like tidy lists',
    itemKind: 'self',
    isPinned: true,
    caller: buildMockWriteCaller(),
  });

  await Promise.allSettled([write]);

  const pending = await memory.store.proposals.listPending();

  expect(write).rejects.toThrowWithMessage(SelfNoteError, 'a self-note is never pinned');
  expect(pending).toStrictEqual([]);
});
