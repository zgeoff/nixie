import { expect, test } from 'bun:test';
import { buildShortIDFromUUID } from '@heynixie/db';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { buildAllowVerdict } from '../test-utils/build-allow-verdict';
import { buildMockCheckerAnswer } from '../test-utils/build-mock-checker-answer';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { createMemoryItem } from '../test-utils/create-memory-item';
import { readItemShortID } from '../test-utils/read-item-short-id';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import type { MemoryTables } from '../types';
import { buildEditTool } from './build-edit-tool';

test('it applies an edit with no quote under your allow rule on memory_write', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(memory.log, item.itemID);

  const outcome = await buildEditTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: { itemID: item.itemID, version: 1, text: 'Lives on Oak Avenue' },
      toolUseID: null,
    },
    buildMockToolContext({}, buildAllowVerdict()),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: shortID, version: 2 },
  });
});

test.each(['conversation', 'task-1'])(
  'it proposes an edit from the %s thread that moves the item to another subject and cites no quote when no rule covers it',
  async (thread) => {
    const memory = await startTestMemory();

    const item = await memory.store.remember({
      text: 'The owner calls the kettle Captain Steam',
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    });

    const outcome = await buildEditTool(memory.store).run(
      {
        callID: 'call-1',
        tool: 'memory.edit',
        input: {
          itemID: item.itemID,
          version: 1,
          text: 'The owner and the assistant call the kettle Captain Steam',
          subject: 'shared',
        },
        toolUseID: null,
      },
      buildMockToolContext({ thread }, { kind: 'gate' }),
    );

    const row = await memory.writer.db
      .$extendTables<MemoryTables>()
      .selectFrom('memory_items')
      .select(['version', 'subject'])
      .where('item_id', '=', item.itemID)
      .executeTakeFirstOrThrow();

    const [proposal] = await memory.store.proposals.listPending();

    invariant(proposal);

    expect(outcome).toStrictEqual({
      status: 'ok',
      hidden: {
        uuids: { [buildShortIDFromUUID(proposal.proposalID)]: proposal.proposalID },
      },
      result: {
        status: 'proposed',
        proposalID: buildShortIDFromUUID(proposal.proposalID),
        reason:
          "no_quote: Saved as a proposal for the owner to review. The write gave no quote, or neither the owner's last 20 messages nor the message its eventID names contains it.",
        merged: false,
      },
    });

    expect(row).toStrictEqual({ version: 1, subject: 'owner' });
  },
);

test('it clears the end time of an item when the edit passes a null end time', async () => {
  const memory = await startTestMemory({
    gate: { clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }) },
  });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await buildEditTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: { itemID: item.itemID, version: 1, text: 'Lives in Lisbon', until: null },
      toolUseID: null,
    },
    buildMockToolContext({}, buildAllowVerdict()),
  );

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['version', 'until'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ version: 2, until: null });
});

test('it moves the end time of an item to the one the edit passes', async () => {
  const memory = await startTestMemory({
    gate: { clock: createFakeClock({ startMs: Date.parse('2026-10-19T08:30:00Z') }) },
  });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-25T23:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await buildEditTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: {
        itemID: item.itemID,
        version: 1,
        text: 'Is in Lisbon until Wednesday',
        until: '2026-10-21T23:59:59+01:00',
      },
      toolUseID: null,
    },
    buildMockToolContext({}, buildAllowVerdict()),
  );

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['version', 'until'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ version: 2, until: Date.parse('2026-10-21T22:59:59Z') });
});

test('it proposes an edit with no quote when no rule decided it', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await buildEditTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: { itemID: item.itemID, version: 1, text: 'Lives on Oak Avenue' },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  const [proposal] = await memory.store.proposals.listPending();

  invariant(proposal);

  expect(outcome).toStrictEqual({
    status: 'ok',
    hidden: {
      uuids: { [buildShortIDFromUUID(proposal.proposalID)]: proposal.proposalID },
    },
    result: {
      status: 'proposed',
      proposalID: buildShortIDFromUUID(proposal.proposalID),
      reason:
        "no_quote: Saved as a proposal for the owner to review. The write gave no quote, or neither the owner's last 20 messages nor the message its eventID names contains it.",
      merged: false,
    },
  });
});

test('it applies an edit that quotes a message outside the window by its event ID as its stamp shows it', async () => {
  const memory = await startTestMemory({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer()),
      limits: { evidenceWindow: 1, proposalLapseMs: 1000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  const item = await createMemoryItem(memory.store, { text: 'Lives on Elm Street' });
  const shortID = await readItemShortID(memory.log, item.itemID);

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I live on Oak Avenue now',
    spans: [{ start: 0, end: 24, source: 'typed' }],
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Thanks',
    spans: [{ start: 0, end: 6, source: 'typed' }],
  });

  const outcome = await buildEditTool(memory.store).run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: {
        itemID: shortID,
        version: 1,
        text: 'Lives on Oak Avenue',
        quote: 'I live on Oak Avenue now',
        eventID: `#${sequence}`,
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: shortID, version: 2 },
  });
});

test('it fills the subject of an edit that leaves it out from the item, in the arguments the rules read', async () => {
  const memory = await startTestMemory();
  const item = await createMemoryItem(memory.store, { text: 'Lives on Elm Street' });
  const shortID = await readItemShortID(memory.log, item.itemID);

  const input = { itemID: shortID, version: 1, text: 'Lives on Oak Avenue' };

  const facts = await buildEditTool(memory.store).resolvePolicyFacts?.(
    input,
    buildMockToolContext(),
  );

  expect(facts).toStrictEqual({
    status: 'ok',
    sources: ['outside'],
    args: { ...input, subject: 'owner' },
  });
});

test('it keeps the subject an edit names in the arguments the rules read', async () => {
  const memory = await startTestMemory();
  const item = await createMemoryItem(memory.store, { text: 'Lives on Elm Street' });

  const input = { itemID: item.itemID, version: 1, text: 'Is a nickname', subject: 'shared' };

  const facts = await buildEditTool(memory.store).resolvePolicyFacts?.(
    input,
    buildMockToolContext(),
  );

  expect(facts).toMatchObject({ status: 'ok', args: { subject: 'shared' } });
});

test('it returns the error of an edit of an item that does not exist, as the facts', async () => {
  const memory = await startTestMemory();

  const facts = await buildEditTool(memory.store).resolvePolicyFacts?.(
    { itemID: crypto.randomUUID(), version: 1, text: 'Lives on Oak Avenue' },
    buildMockToolContext(),
  );

  expect(facts).toMatchObject({ status: 'error', message: expect.toStartWith('no memory item') });
});
