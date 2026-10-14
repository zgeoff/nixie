import { expect, test } from 'bun:test';
import { buildEditTool } from './build-edit-tool';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { makeToolAllowRule } from './test-utils/make-tool-allow-rule';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';

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
