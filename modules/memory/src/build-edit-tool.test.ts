import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { buildEditTool } from './build-edit-tool';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { createMemoryItem } from './test-utils/create-memory-item';
import { makeToolAllowRule } from './test-utils/make-tool-allow-rule';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

test('it applies an edit with no quote under your allow rule on memory.edit', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: makeToolAllowRule('memory.edit') },
  });

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
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: shortID, version: 2 },
  });
});

test('it clears the end time of an item when the edit passes a null end time', async () => {
  const memory = await startTestMemory({
    gate: {
      findAllowRule: makeToolAllowRule('memory.edit'),
      clock: buildTestClock(Date.parse('2026-10-19T08:30:00Z')),
    },
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
    buildMockToolContext(),
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
    gate: {
      findAllowRule: makeToolAllowRule('memory.edit'),
      clock: buildTestClock(Date.parse('2026-10-19T08:30:00Z')),
    },
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
    buildMockToolContext(),
  );

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['version', 'until'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ version: 2, until: Date.parse('2026-10-21T22:59:59Z') });
});

test('it proposes an edit with no quote when your allow rule names only memory.remember', async () => {
  const memory = await startTestMemory({
    gate: { findAllowRule: makeToolAllowRule('memory.remember') },
  });

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

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'proposed',
      proposalID: expect.toBeString(),
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
