import { expect, test } from 'bun:test';
import { buildMockModelsConfig } from '@heynixie/models/test-utils';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import { buildTaskStartBounds } from './build-task-start-bounds';

test('it offers each selectable model that does not ask, with what its harness lacks for a task and the task run limits', () => {
  const config = buildMockModelsConfig({
    profiles: { 'chat-direct': {}, big: {} },
    selectable: [
      { name: 'deep-think', profile: 'big', description: 'Most capable', isAsked: true },
      { name: 'second-look', profile: 'router-b', description: 'Another family', isAsked: false },
    ],
  });

  const bounds = buildTaskStartBounds(
    {
      ...config,
      profiles: {
        ...config.profiles,
        'router-b': {
          id: 'router-b',
          harness: 'codex',
          baseURL: 'https://models.example.test',
          credential: 'deployment:openai',
          model: 'gpt-test-1',
          prices: null,
        },
      },
    },
    [],
    [],
  );

  expect(bounds).toStrictEqual({
    models: [
      { name: 'second-look', profile: 'router-b', description: 'Another family', missing: [] },
    ],
    limits: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
    memoryTools: { read: [], write: [] },
    conversationTools: [],
  });
});

test('it sorts the memory tools into the ones that only read and the rest', () => {
  const bounds = buildTaskStartBounds(
    buildMockModelsConfig(),
    [
      buildMockToolDefinition({ name: 'memory.recall', declaration: { effects: ['read'] } }),
      buildMockToolDefinition({ name: 'memory.remember', declaration: { effects: ['note'] } }),
      buildMockToolDefinition({ name: 'moment.read', declaration: { effects: ['read'] } }),
    ],
    [],
  );

  expect(bounds.memoryTools).toStrictEqual({
    read: ['memory.recall', 'moment.read'],
    write: ['memory.remember'],
  });
});

test('it names each conversation tool by its name', () => {
  const bounds = buildTaskStartBounds(
    buildMockModelsConfig(),
    [],
    [
      buildMockToolDefinition({ name: 'skill_read' }),
      buildMockToolDefinition({ name: 'skill_reload' }),
    ],
  );

  expect(bounds.conversationTools).toStrictEqual(['skill_read', 'skill_reload']);
});
