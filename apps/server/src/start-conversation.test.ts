import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { modelsConfigSchema } from '@heynixie/models';
import { claimTask, createConversationTask, runTaskStep, writeInboxRecords } from '@heynixie/tasks';
import { startScriptedModel } from '@heynixie/testing';
import { startConversation } from './start-conversation';
import { startTestServer } from './test-utils/start-test-server';

// the conversation task on a test server, the scripted model, and a step runner
async function setupTest() {
  const server = await startTestServer();
  const model = startScriptedModel();

  await createConversationTask(server.context);

  return {
    ...server,
    model,
    sendMessage: async (runStep: Parameters<typeof runTaskStep>[2]['runStep'], text: string) => {
      await writeInboxRecords(server.context, [
        {
          kind: 'owner_message',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          erasable: { text },
        },
      ]);

      const claim = await claimTask(server.context, { holder: 'runner-a', leaseMs: 60_000 });

      if (claim === null) {
        throw new Error('the conversation had no work to claim');
      }
      await runTaskStep(server.context, claim, {
        runStep,
        leaseMs: 60_000,
        maxStepErrors: 1,
        retryDelayMs: 30_000,
      });
    },
    readReplies: async () => {
      const entries = await readRecords(server.context.log, { afterSequence: 0 });

      return entries.map((entry) => entry.record).filter((record) => record.kind === 'model.reply');
    },
  };
}

test('it runs each turn in the conversation guest on the role profile and resumes at the boundary', async () => {
  const ctx = await setupTest();
  const runner = await startConversation({
    context: ctx.context,
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: ctx.model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: ctx.sandboxes,
    tools: ctx.endpoint,
    toolNames: [],
    image: 'nixie-conversation-0123456789ab',
    getSystemPrompt: () => 'You are nixie.',
  });

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' });
  await ctx.sendMessage(runner.runStep, 'Say a fruit.');
  await ctx.sendMessage(runner.runStep, 'Another.');

  const replies = await ctx.readReplies();

  expect(replies).toMatchObject([
    {
      payload: { model: 'claude-test-1', profile: 'chat-direct' },
      erasable: { fields: { text: 'APPLE' } },
    },
    {
      payload: { model: 'claude-test-1', profile: 'chat-direct' },
      erasable: { fields: { text: 'BANANA' } },
    },
  ]);
  expect(ctx.model.requests.filter((request) => request.path === '/v1/messages')).toMatchObject([
    { headers: { 'x-api-key': 'imp-broker-placeholder' }, body: { model: 'claude-test-1' } },
    { headers: { 'x-api-key': 'imp-broker-placeholder' }, body: { model: 'claude-test-1' } },
  ]);
  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).toInclude('APPLE');
}, 30_000);
