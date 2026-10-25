import { expect, test } from 'bun:test';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildTasksListTool } from './build-tasks-list-tool';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { startTestTasks } from './test-utils/start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it lists the tasks other than the caller, with each last activity in UTC', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: {} }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      tasks: [
        {
          id: 'planner',
          name: 'Planner',
          state: 'ready',
          brief: 'Plans the week.',
          lastActivityAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
        },
      ],
    },
  });
});

test('it lists only as many tasks as the limit asks for', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'critic');

  const tool = buildTasksListTool(ctx.context, {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
    ],
  });

  const outcome = await tool.run(
    buildMockToolCall({ tool: 'tasks.list', input: { limit: 1 } }),
    buildMockToolContext({ run: { thread: 'conversation' } }),
  );

  expect(outcome).toMatchObject({ status: 'ok', result: { tasks: [{ id: 'critic' }] } });
});
