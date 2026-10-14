import { expect, test } from 'bun:test';
import { buildEditTool } from './build-edit-tool';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { createMemoryItem } from './test-utils/create-memory-item';
import { makeToolAllowRule } from './test-utils/make-tool-allow-rule';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

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
        "no_quote: Saved as a proposal for the owner to review. The write gave no quote, or none of the owner's last 20 messages contains it.",
      merged: false,
    },
  });
});

test('it applies an edit that quotes a message outside the window by its event ID', async () => {
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
        eventID: String(sequence),
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
