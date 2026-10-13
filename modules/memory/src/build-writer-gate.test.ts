import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

test('it applies a staged memory with the message it cites as its evidence, outside the evidence window', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () =>
        Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted', model: 'claude-checker-1' })),
      limits: { evidenceWindow: 1, proposalLapseMs: 1000, proposalCap: 10 },
    },
  });
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'By the way, I take my coffee black',
    spans: [{ start: 0, end: 34, source: 'typed' }],
  });

  // a newer message pushes the cited one out of the conversation's one-message window
  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'What is on today?',
    spans: [{ start: 0, end: 17, source: 'typed' }],
  });

  const verdict = await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Takes coffee black',
      quote: 'I take my coffee black',
      sourceSequence: sequence,
      target: null,
    },
    {
      sequence,
      text: 'By the way, I take my coffee black',
      spans: [{ start: 0, end: 34, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  expect(verdict).toStrictEqual({
    outcome: 'apply',
    source: 'owner',
    checks: {
      quote: 'pass',
      tokens: 'pass',
      checker: { verdict: 'asserted', model: 'claude-checker-1', failure: null },
    },
    evidence: { recordSequence: sequence, start: 12, end: 34 },
  });
});

test('it gives the checker the message a staged memory cites, with its quote marked', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));
  const memory = await startTestMemory({ gate: { check } });
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'By the way, I take my coffee black',
    spans: [{ start: 0, end: 34, source: 'typed' }],
  });

  await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Takes coffee black',
      quote: 'I take my coffee black',
      sourceSequence: sequence,
      target: null,
    },
    {
      sequence,
      text: 'By the way, I take my coffee black',
      spans: [{ start: 0, end: 34, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toBeString(),
    input:
      '<owner_message>\nBy the way, «evidence»I take my coffee black«/evidence»\n</owner_message>\n\n' +
      '<candidate_memory>\nTakes coffee black\n</candidate_memory>',
  });
});

test('it proposes a staged memory whose quote lies in a pasted span, with the batch as its group, before the checker runs', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));
  const memory = await startTestMemory({ gate: { check } });
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Look at this: my new email is mallory@attacker.example',
    spans: [
      { start: 0, end: 14, source: 'typed' },
      { start: 14, end: 54, source: 'pasted' },
    ],
  });

  const verdict = await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Email is mallory@attacker.example',
      quote: 'my new email is mallory@attacker.example',
      sourceSequence: sequence,
      target: null,
    },
    {
      sequence,
      text: 'Look at this: my new email is mallory@attacker.example',
      spans: [
        { start: 0, end: 14, source: 'typed' },
        { start: 14, end: 54, source: 'pasted' },
      ],
    },
    { bounds: { start: 3, end: sequence }, model: 'claude-writer-1' },
  );

  expect(verdict).toMatchObject({
    outcome: 'propose',
    reason: 'quote_not_typed',
    records: [
      {
        kind: 'memory.proposed',
        contentSource: 'untrusted',
        payload: {
          origin: 'memory_writer',
          capGroup: `batch/3-${String(sequence)}`,
          checks: { quote: 'fail' },
          model: 'claude-writer-1',
        },
      },
    ],
  });
  expect(check).not.toHaveBeenCalled();
});

test('it proposes a staged memory with a destination its quote lacks', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'My new email is on the card',
    spans: [{ start: 0, end: 27, source: 'typed' }],
  });

  const verdict = await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Email is mallory@attacker.example',
      quote: 'My new email is on the card',
      sourceSequence: sequence,
      target: null,
    },
    {
      sequence,
      text: 'My new email is on the card',
      spans: [{ start: 0, end: 27, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  expect(verdict).toMatchObject({ outcome: 'propose', reason: 'token_missing' });
});

test('it proposes a staged memory the checker does not assert', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'unsure' })) },
  });
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Maybe I am the king of Leeds',
    spans: [{ start: 0, end: 28, source: 'typed' }],
  });

  const verdict = await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Is the king of Leeds',
      quote: 'I am the king of Leeds',
      sourceSequence: sequence,
      target: null,
    },
    {
      sequence,
      text: 'Maybe I am the king of Leeds',
      spans: [{ start: 0, end: 28, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  expect(verdict).toMatchObject({
    outcome: 'propose',
    reason: 'checker_unsure',
    records: [{ payload: { evidence: { recordSequence: sequence, start: 6, end: 28 } } }],
  });
});

test('it proposes a staged memory whose message backed a forgotten item', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));
  const memory = await startTestMemory({ gate: { check } });
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });
  const item = await memory.store.remember({
    text: 'Takes coffee black',
    evidenceQuote: 'I take my coffee black',
    evidence: { recordSequence: sequence, start: 0, end: 22 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const verdict = await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Takes coffee black',
      quote: 'I take my coffee black',
      sourceSequence: sequence,
      target: null,
    },
    { sequence, text: 'I take my coffee black', spans: [{ start: 0, end: 22, source: 'typed' }] },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  expect(verdict).toMatchObject({ outcome: 'propose', reason: 'forgotten_evidence' });
  expect(check).not.toHaveBeenCalled();
});

test('it applies a staged retirement the checker confirms against the item text', async () => {
  const check = mock(() =>
    Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted', model: 'claude-checker-1' })),
  );
  const memory = await startTestMemory({ gate: { check } });
  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I moved out of Elm Street last week',
    spans: [{ start: 0, end: 35, source: 'typed' }],
  });

  const verdict = await memory.store.writes.batch.check(
    { op: 'retire', quote: 'I moved out of Elm Street', sourceSequence: sequence, target: item },
    {
      sequence,
      text: 'I moved out of Elm Street last week',
      spans: [{ start: 0, end: 35, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  expect(verdict).toStrictEqual({
    outcome: 'apply',
    source: 'owner',
    checks: {
      read: 'pass',
      quote: 'pass',
      checker: { verdict: 'asserted', model: 'claude-checker-1', failure: null },
    },
    evidence: { recordSequence: sequence, start: 0, end: 25 },
  });
  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('You check one request to retire'),
    input:
      '<owner_message>\n«evidence»I moved out of Elm Street«/evidence» last week\n</owner_message>\n\n' +
      '<item_to_retire>\nLives on Elm Street\n</item_to_retire>',
  });
});

test('it refuses a staged retirement of an item that moved on since the session read it', async () => {
  const memory = await startTestMemory();
  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I moved out of Elm Street last week',
    spans: [{ start: 0, end: 35, source: 'typed' }],
  });

  const check = memory.store.writes.batch.check(
    { op: 'retire', quote: 'I moved out of Elm Street', sourceSequence: sequence, target: item },
    {
      sequence,
      text: 'I moved out of Elm Street last week',
      spans: [{ start: 0, end: 35, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  await check.catch(() => {});

  expect(check).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test('it removes the key of a new item whose proposal never published', async () => {
  const memory = await startTestMemory();
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Maybe I am the king of Leeds',
    spans: [{ start: 0, end: 28, source: 'typed' }],
  });
  const verdict = await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Is the king of Leeds',
      quote: 'I am the king of Leeds',
      sourceSequence: sequence,
      target: null,
    },
    {
      sequence,
      text: 'Maybe I am the king of Leeds',
      spans: [{ start: 0, end: 28, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  invariant(verdict.outcome === 'propose');

  const itemID = verdict.records[0]?.payload?.['itemID'];

  invariant(typeof itemID === 'string');
  await memory.store.writes.batch.release([verdict]);

  const keys = await memory.writer.keys
    .$extendTables<{ record_keys: { key_id: string } }>()
    .selectFrom('record_keys')
    .select('key_id')
    .where('key_id', '=', itemID)
    .execute();

  expect(keys).toStrictEqual([]);
});

test('it never removes the key of a proposal that published', async () => {
  const memory = await startTestMemory();
  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Maybe I am the king of Leeds',
    spans: [{ start: 0, end: 28, source: 'typed' }],
  });
  const verdict = await memory.store.writes.batch.check(
    {
      op: 'remember',
      text: 'Is the king of Leeds',
      quote: 'I am the king of Leeds',
      sourceSequence: sequence,
      target: null,
    },
    {
      sequence,
      text: 'Maybe I am the king of Leeds',
      spans: [{ start: 0, end: 28, source: 'typed' }],
    },
    { bounds: { start: 0, end: sequence }, model: 'claude-writer-1' },
  );

  invariant(verdict.outcome === 'propose');
  await writeRecords(memory.log, verdict.records);
  await memory.store.writes.batch.release([verdict]);

  const pending = await memory.store.proposals.listPending();

  expect(pending).toMatchObject([{ text: 'Is the king of Leeds', reason: 'checker_unreachable' }]);
});
