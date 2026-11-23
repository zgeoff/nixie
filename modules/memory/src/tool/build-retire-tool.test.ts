import { expect, test } from 'bun:test';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { createMemoryItem } from '../test-utils/create-memory-item';
import { startTestMemory } from '../test-utils/start-test-memory';
import { buildRetireTool } from './build-retire-tool';

test('it tells the assistant to keep the argument for a change of mind in the notebook', async () => {
  const memory = await startTestMemory();

  expect(buildRetireTool(memory.store).description).toInclude(
    'When you change your mind about an item, edit or retire it, and keep the argument in the notebook, linked to the item with supersedes or disputes.',
  );
});

test.each(['owner', 'shared'] as const)(
  'it refuses a granted task a retirement of a %s item before the decision point',
  async (subject) => {
    const memory = await startTestMemory();
    const item = await createMemoryItem(memory.store, { text: 'Lives on Elm Street', subject });

    const facts = await buildRetireTool(memory.store).resolvePolicyFacts?.(
      { itemID: item.itemID, version: 1 },
      buildMockToolContext({ thread: 'task-1', hasSelfNoteGrant: true }),
    );

    expect(facts).toMatchObject({
      status: 'error',
      message: expect.toInclude('grants it self-note writes only'),
    });
  },
);
