import { expect, test } from 'bun:test';
import { startTestMemory } from '../test-utils/start-test-memory';
import { buildRetireTool } from './build-retire-tool';

test('it tells the assistant to keep the argument for a change of mind in the notebook', async () => {
  const memory = await startTestMemory();

  expect(buildRetireTool(memory.store).description).toInclude(
    'When you change your mind about an item, edit or retire it, and keep the argument in the notebook, linked to the item with supersedes or disputes.',
  );
});
