import { expect, test } from 'bun:test';
import { parseJSONObject } from '@heynixie/log';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildTestDefineInput } from '../../test-utils/build-test-define-input';
import { startTestDefinitions } from '../../test-utils/start-test-definitions';
import { requestDefinitionChange } from '../request-definition-change';
import { buildTaskUndefineTool } from './build-task-undefine-tool';

async function setupTest() {
  const ctx = await startTestDefinitions();

  const tool = buildTaskUndefineTool({
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('UTC'),
  });

  return {
    ...ctx,
    tool,
    undefine: (input: object) => {
      const call = buildMockToolCall({
        tool: 'task.undefine',
        input: parseJSONObject(JSON.stringify(input)),
      });

      return tool.run(call, buildMockToolContext());
    },
  };
}

test('it declares the schedule effect and runs direct', async () => {
  const ctx = await setupTest();

  expect([ctx.tool.declaration.effects, ctx.tool.execution]).toStrictEqual([
    ['schedule'],
    'direct',
  ]);
});

test('it removes a defined definition and returns its ID and the short change ID', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({}),
  });

  const outcome = await ctx.undefine({ definitionID: 'water-the-tomatoes' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { definitionID: 'water-the-tomatoes', changeID: expect.any(String) },
  });
});

test('it returns NOT_FOUND for a definition that does not exist', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.undefine({ definitionID: 'feed-the-cat' });

  expect(outcome).toStrictEqual({ status: 'ok', result: { refused: { code: 'NOT_FOUND' } } });
});

test('it returns an error for an input that breaks the schema', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const outcome = await ctx.undefine({});

  expect(outcome.status).toBe('error');
});

test('it returns an error before the definitions are started', async () => {
  const tool = buildTaskUndefineTool({
    readDefinitions: () => null,
    readZone: () => Promise.resolve('UTC'),
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'task.undefine', input: { definitionID: 'water-the-tomatoes' } }),
    buildMockToolContext(),
  );

  expect(outcome.status).toBe('error');
});
