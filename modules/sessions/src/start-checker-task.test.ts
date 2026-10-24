import { expect, mock, test } from 'bun:test';
import { modelsConfigSchema } from '@heynixie/models';
import { buildTestClock } from '@heynixie/testing';
import { startCheckerTask } from './start-checker-task';
import { startTestSessionHost } from './test-utils/start-test-session-host';

async function setupTest() {
  return { host: await startTestSessionHost() };
}

test('it runs each check in the check guest on the checker role profile', async () => {
  const ctx = await setupTest();

  const checker = await startCheckerTask({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: 'https://models.example.test',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
        checker: {
          base_url: 'https://checker.example.test',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-checker',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct', checker: 'checker' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: ctx.host.sandboxes,
    image: 'nixie-conversation-0123456789ab',
    timeoutMs: 60_000,
    clock: buildTestClock(1_700_000_000_000),
    log: () => {},
  });

  ctx.host.guest.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  const answer = await checker.check({
    prompt: 'You check one candidate memory.',
    input: '<owner_message>\nI take my coffee black\n</owner_message>',
  });

  expect(answer).toStrictEqual({
    verdict: 'asserted',
    reason: 'Stated.',
    model: 'claude-test-checker',
    failure: null,
  });

  expect(ctx.host.guest.checks).toStrictEqual([
    {
      profile: {
        model: 'claude-test-checker',
        baseURL: expect.toStartWith('https://checker.example.test'),
        effort: 'low',
        authHeader: 'x-api-key',
      },
      systemPrompt: 'You check one candidate memory.',
      input: '<owner_message>\nI take my coffee black\n</owner_message>',
    },
  ]);
});

test('it logs where each check spent its time', async () => {
  const ctx = await setupTest();

  const log = mock<Parameters<typeof startCheckerTask>[0]['log']>();

  const checker = await startCheckerTask({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: 'https://models.example.test',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
        checker: {
          base_url: 'https://checker.example.test',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-checker',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct', checker: 'checker' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: ctx.host.sandboxes,
    image: 'nixie-conversation-0123456789ab',
    timeoutMs: 60_000,
    clock: buildTestClock(1_700_000_000_000),
    log,
  });

  ctx.host.guest.addCheckAnswers({ verdict: 'asserted', reason: 'Stated.' });

  await checker.check({
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
