import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readDefinitionTaskInTransaction, writeTaskControl } from '@heynixie/tasks';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { buildTestDefineInput } from '../../test-utils/build-test-define-input';
import { buildTestTaskYaml } from '../../test-utils/build-test-task-yaml';
import { seedLostTaskVersions } from '../../test-utils/seed-lost-task-versions';
import { startTestDefinitions } from '../../test-utils/start-test-definitions';
import { requestDefinitionChange } from '../request-definition-change';
import { buildTasksDefinitionsTool } from './build-tasks-definitions-tool';

async function setupTest() {
  const ctx = await startTestDefinitions();

  ctx.clock.advance(Date.parse('2027-03-08T00:00:00Z') - ctx.clock.now());

  const tool = buildTasksDefinitionsTool({
    readDefinitions: () => ctx.context,
    readZone: () => Promise.resolve('UTC'),
  });

  return {
    ...ctx,
    tool,
    list: () => tool.run(buildMockToolCall({ tool: 'tasks.definitions' }), buildMockToolContext()),
  };
}

test('it declares the read effect and runs direct', async () => {
  const ctx = await setupTest();

  expect([ctx.tool.declaration.effects, ctx.tool.execution]).toStrictEqual([['read'], 'direct']);
});

test('it lists a definition from the repo with the default task tools', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const outcome = await ctx.list();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      definitions: [
        {
          definitionID: 'water-the-tomatoes',
          name: 'Water the tomatoes',
          enabled: true,
          isInForce: true,
          held: null,
          isUnreadable: false,
          trigger: expect.any(Object),
          rendered: 'every Friday at 08:00 (UTC)',
          next: 'Fri 12 Mar',
          tools: expect.arrayContaining(['tasks.list', 'task.message']),
          origin: 'definitions',
        },
      ],
    },
  });
});

test.each([
  ['stop', 'stopped'],
  ['pause', 'paused'],
] as const)(
  'it lists a definition whose task the user chose to %s as held, with no next fire',
  async (control, held) => {
    const ctx = await setupTest();

    await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
    await ctx.seed();

    const answer = await withWriteTransaction(ctx.writer, (tx) =>
      readDefinitionTaskInTransaction(tx, 'water-the-tomatoes'),
    );

    invariant(answer, 'the seed bound a task to the definition');

    await writeTaskControl(ctx.tasks, { taskID: answer.taskID, control });

    const outcome = await ctx.list();

    expect(outcome).toStrictEqual({
      status: 'ok',
      result: {
        definitions: [expect.objectContaining({ isInForce: true, held, next: null })],
      },
    });
  },
);

test('it lists a definition from a change made in the conversation with the nixie origin', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput({}) });

  const outcome = await ctx.list();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      definitions: [expect.objectContaining({ origin: 'nixie', isInForce: true })],
    },
  });
});

test('it lists a disabled definition as out of force with no next fire', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ isEnabled: false }));
  await ctx.seed();

  const outcome = await ctx.list();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      definitions: [expect.objectContaining({ enabled: false, isInForce: false, next: null })],
    },
  });
});

test('it lists a definition whose version is lost as unreadable', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput({}) });
  await seedLostTaskVersions(ctx.writer);

  const outcome = await ctx.list();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      definitions: [
        expect.objectContaining({
          isUnreadable: true,
          isInForce: false,
          name: null,
          next: null,
        }),
      ],
    },
  });
});

test('it returns an error before the definitions are started', async () => {
  const tool = buildTasksDefinitionsTool({
    readDefinitions: () => null,
    readZone: () => Promise.resolve('UTC'),
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.definitions' }),
    buildMockToolContext(),
  );

  expect(outcome.status).toBe('error');
});
