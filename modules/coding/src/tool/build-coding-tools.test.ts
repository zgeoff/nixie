import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { startTestCoding } from '../test-utils';
import { buildCodingActionTools } from './build-coding-action-tools';

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

test('it describes no coding tool as a user turn, as typed by the user, as your own, or by a menu', async () => {
  const ctx = await startTestCoding();

  const descriptions = [...ctx.tools.values(), ...buildCodingActionTools()]
    .filter((tool) => tool.name.startsWith('coding.'))
    .map((tool) => tool.description);

  expect(descriptions).toHaveLength(8);

  expect(descriptions).toSatisfyAll(
    (description: string) => !/user turn|typed by the user|your own|menu/iu.test(description),
  );
});
