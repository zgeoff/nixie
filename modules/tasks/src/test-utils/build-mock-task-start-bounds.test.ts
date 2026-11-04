import { expect, test } from 'bun:test';
import { buildMockTaskStartBounds } from './build-mock-task-start-bounds';

test('it builds bounds with no selectable model, the default limits, two memory tools of each kind and one conversation tool', () => {
  expect(buildMockTaskStartBounds()).toStrictEqual({
    models: [],
    limits: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
    memoryTools: {
      read: ['memory.recall', 'moment.read'],
      write: ['memory.remember', 'moment.keep'],
    },
    conversationTools: ['skill_read'],
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockTaskStartBounds({
      models: [{ name: 'second-look', profile: 'router-b', description: 'Another family' }],
    }).models,
  ).toStrictEqual([{ name: 'second-look', profile: 'router-b', description: 'Another family' }]);
});
