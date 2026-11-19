import { expect, test } from 'bun:test';
import { collectDefinitionTools } from './collect-definition-tools';

test.each([
  ['no list', undefined, ['tasks.list', 'task.message', 'task.report', 'time.now']],
  [
    'a list without the base tools',
    ['code.run'],
    ['tasks.list', 'task.message', 'task.report', 'code.run'],
  ],
  [
    'a list with the SDK name of a base tool',
    ['mcp__nixie__tasks_list', 'code.run'],
    ['tasks.list', 'task.message', 'task.report', 'code.run'],
  ],
  [
    'a list with a base tool',
    ['task.message', 'time.now'],
    ['tasks.list', 'task.message', 'task.report', 'time.now'],
  ],
])('it gives a definition with %s the base tools first', (_case, listed, tools) => {
  expect(collectDefinitionTools(listed)).toStrictEqual(tools);
});
