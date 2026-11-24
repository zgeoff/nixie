import { expect, test } from 'bun:test';
import { createTestCredentials } from '@heynixie/credentials/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startTestSessionHost } from '../test-utils/start-test-session-host';
import { startWorkerTool } from './start-worker-tool';

async function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const host = await startTestSessionHost({ clock, tools: [] });

  const profile = {
    harness: 'agent-sdk',
    base_url: 'https://models.example.test',
    credential: 'deployment:anthropic',
    auth_header: 'x-api-key',
    effort: 'low',
    prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
  };

  const models = modelsConfigSchema.parse({
    profiles: {
      chat: { ...profile, model: 'claude-test-1' },
      big: { ...profile, model: 'claude-test-big' },
    },
    roles: { conversation: 'chat', worker: 'chat' },
    selectable: { big: { profile: 'big', description: 'Slower and stronger.' } },
  });

  const worker = await startWorkerTool({
    models,
    credentials: await createTestCredentials({
      model_credentials: { anthropic: 'not-a-real-key' },
    }),
    sandboxes: host.sandboxes,
    images: { conversation: 'nixie-conversation-0123456789ab' },
    log: host.context.log,
    definitions: host.context.definitions,
    clock,
    logger: () => {},
    readTools: () => null,
  });

  host.defer(() => worker.stop());

  const bounds = {
    memoryTools: { read: [], write: [] },
    conversationTools: [],
  };

  return {
    buildTool: (choices: readonly { name: string; description: string }[]) =>
      worker.buildTool({
        ...bounds,
        models: choices.map((choice) => ({ ...choice, profile: choice.name, missing: [] })),
      }),
  };
}

test('it offers the selectable models as an optional model option with their descriptions', async () => {
  const ctx = await setupTest();

  const tool = ctx.buildTool([
    { name: 'big', description: 'Slower and stronger.' },
    { name: 'small', description: 'Quick and cheap.' },
  ]);

  expect(tool.input).toStrictEqual({
    type: 'object',
    properties: {
      question: { type: 'string', minLength: 1, maxLength: 8000 },
      tools: { type: 'array', items: { type: 'string' }, maxItems: 50, uniqueItems: true },
      model: {
        type: 'string',
        enum: ['big', 'small'],
        description:
          "The model the worker runs on; leave it out for the worker's usual one. big: Slower and stronger.; small: Quick and cheap.",
      },
    },
    required: ['question'],
    additionalProperties: false,
  });
});

test('it leaves the model option out when no model is selectable', async () => {
  const ctx = await setupTest();

  const tool = ctx.buildTool([]);

  expect(tool.input).toStrictEqual({
    type: 'object',
    properties: {
      question: { type: 'string', minLength: 1, maxLength: 8000 },
      tools: { type: 'array', items: { type: 'string' }, maxItems: 50, uniqueItems: true },
    },
    required: ['question'],
    additionalProperties: false,
  });
});

test('it tells the model when to use a worker and when to start a task', async () => {
  const ctx = await setupTest();

  const tool = ctx.buildTool([]);

  expect(tool.description).toEndWith(
    'Use a worker when you need the answer in this turn, and a task when the work can run on while you keep talking.',
  );
});
