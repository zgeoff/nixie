import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { startTestCoding } from '../test-utils';

test('it builds tools that the tool registry takes, each with a result whose fields have a source', async () => {
  const ctx = await startTestCoding();

  const registry = buildToolRegistry([...ctx.tools.values()]);

  expect(
    ['coding.sessions', 'coding.steer', 'coding.message', 'coding.read', 'coding.watch'].map(
      (name) => registry.findTool(name)?.definition.name ?? null,
    ),
  ).toStrictEqual([
    'coding.sessions',
    'coding.steer',
    'coding.message',
    'coding.read',
    'coding.watch',
  ]);
});
