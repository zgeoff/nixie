import { expect, test } from 'bun:test';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildDefineVersion } from './build-define-version';

function setupTest() {
  const seed = buildTestTaskSeed(['tracker']);

  return {
    define: (tools: readonly string[]) =>
      buildDefineVersion(
        {
          name: 'Check the rain gauge',
          brief: 'Read the gauge and note the total.',
          trigger: { at: '2027-03-09T14:00:00+11:00' },
          tools,
        },
        seed,
      ),
  };
}

test.each([
  ['the whole server', 'tracker.*'],
  ['one tool of the server', 'tracker.item_get'],
])('it builds a definition from chat that names %s of a configured MCP server', (_case, entry) => {
  const ctx = setupTest();
  const built = ctx.define([entry]);

  expect(built.status).toBe('built');
});

test('it refuses a definition from chat that names a server the config lacks', () => {
  const ctx = setupTest();
  const built = ctx.define(['calendar.*']);

  expect(built.status).toBe('invalid');
});
