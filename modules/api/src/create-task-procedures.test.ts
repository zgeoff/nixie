import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

test('#tasks.list lists the conversation and each started task with its name and brief', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await writeRecords(api.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const listed = await client.tasks.list({});

  expect(listed.tasks).toIncludeSameMembers([
    {
      brief: 'Talks with the owner and answers each message.',
      lastActivityAt: expect.toBeValidDate(),
      name: 'Conversation',
      state: expect.toBeString(),
      taskID: 'conversation',
    },
    {
      brief: 'Plan the beds.',
      lastActivityAt: expect.toBeValidDate(),
      name: 'Garden plan',
      state: 'waiting',
      taskID: 'k3x9m2p7qa',
    },
  ]);
});

test('#tasks.list refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  expect(stranger.tasks.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
