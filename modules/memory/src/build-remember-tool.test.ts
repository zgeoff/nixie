import { expect, test } from 'bun:test';
import { buildRememberTool } from './build-remember-tool';
import { startTestMemory } from './test-utils';

test('it describes memory.remember with no word about pinning, and takes no pin input', async () => {
  const memory = await startTestMemory();

  const tool = buildRememberTool(memory.store);

  expect(tool.description).not.toMatch(/\bpin/iu);
  expect(JSON.stringify(tool.input)).not.toInclude('"pin"');
});
