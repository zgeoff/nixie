import { expect, mock, onTestFinished, test } from 'bun:test';
import { modelsConfigSchema } from '@heynixie/models';
import { buildTestClock, startScriptedModel } from '@heynixie/testing';
import { startChecker } from './start-checker';
import { startTestServer } from './test-utils/start-test-server';

// a test server for its process sandboxes, and the scripted model
async function setupTest() {
  const server = await startTestServer();

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  return { ...server, model };
}

test('it runs each check in the check guest on the checker role profile', async () => {
  const ctx = await setupTest();

  const check = await startChecker({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: ctx.model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
        checker: {
          base_url: ctx.model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-checker',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct', checker: 'checker' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: ctx.sandboxes,
    image: 'nixie-conversation-0123456789ab',
    timeoutMs: 60_000,
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  ctx.model.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  const answer = await check({
    prompt: 'You check one candidate memory.',
    input: '<owner_message>\nI take my coffee black\n</owner_message>',
  });

  expect(answer).toStrictEqual({
    verdict: 'asserted',
    reason: 'Stated.',
    model: 'claude-test-checker',
    failure: null,
  });

  expect(ctx.model.requests.filter((request) => request.path === '/v1/messages')).toMatchObject([
    { headers: { 'x-api-key': 'imp-broker-placeholder' }, body: { model: 'claude-test-checker' } },
  ]);
});

test('it logs where each check spent its time', async () => {
  const ctx = await setupTest();

  const log = mock<Parameters<typeof startChecker>[0]['log']>();

  const check = await startChecker({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: ctx.model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
        checker: {
          base_url: ctx.model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-checker',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct', checker: 'checker' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: ctx.sandboxes,
    image: 'nixie-conversation-0123456789ab',
    timeoutMs: 60_000,
    clock: buildTestClock(1_700_000_000_000),
    log,
  });

  ctx.model.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  await check({
    prompt: 'You check one candidate memory.',
    input: '<owner_message>\nI take my coffee black\n</owner_message>',
  });

  expect(log).toHaveBeenCalledExactlyOnceWith('checker.timed', {
    outcome: 'answer',
    spawnMs: expect.toBeNumber(),
    replyMs: expect.toBeNumber(),
    cliMs: expect.toBeNumber(),
    apiMs: expect.toBeNumber(),
    totalMs: expect.toBeNumber(),
  });
});
