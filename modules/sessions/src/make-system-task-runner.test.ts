import { expect, test } from 'bun:test';
import { modelsConfigSchema } from '@heynixie/models';
import { buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import type { SystemTaskSession } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';

test('it starts the task on its role profile, in a sandbox with the shared limits', async () => {
  const sessions: SystemTaskSession[] = [];

  const startTask = makeSystemTaskRunner({
    role: 'memory-writer',
    entry: 'main',
    start: (_options, session) => {
      sessions.push(session);

      return Promise.resolve({ name: 'writer' });
    },
  });

  const runner = await startTask({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: 'http://127.0.0.1:1',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
        'writer-direct': {
          base_url: 'http://127.0.0.1:1',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-writer',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct', 'memory-writer': 'writer-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: buildStubSandboxes().adapter,
    image: 'nixie-conversation-0123456789ab',
  });

  expect(runner.name).toBe('writer');

  expect(sessions).toMatchObject([
    {
      profile: { profile: { id: 'writer-direct', model: 'claude-test-writer' } },
      limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
      command: { argv: ['bun', '/app/guests/conversation/src/main.ts'] },
    },
  ]);
});

test('it runs the check guest for a task whose entry is the check', async () => {
  const commands: SystemTaskSession['command'][] = [];

  const startTask = makeSystemTaskRunner({
    role: 'checker',
    entry: 'check',
    start: (_options, session) => {
      commands.push(session.command);

      return Promise.resolve({});
    },
  });

  await startTask({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: 'http://127.0.0.1:1',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: buildStubSandboxes().adapter,
    image: 'nixie-conversation-0123456789ab',
  });

  expect(commands).toStrictEqual([
    { argv: ['bun', '/app/guests/conversation/src/check.ts'], env: { HOME: '/home/nixie' } },
  ]);
});

test('it stops the parts the start registered, the last registered first, when the runner stops', async () => {
  const stopped: string[] = [];

  const startTask = makeSystemTaskRunner({
    role: 'memory-consolidator',
    entry: 'main',
    start: (_options, session) => {
      session.defer(() => {
        stopped.push('endpoint');

        return Promise.resolve();
      });

      session.defer(() => {
        stopped.push('session runner');

        return Promise.resolve();
      });

      return Promise.resolve({});
    },
  });

  const runner = await startTask({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: 'http://127.0.0.1:1',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: buildStubSandboxes().adapter,
    image: 'nixie-conversation-0123456789ab',
  });

  await runner.stop();

  expect(stopped).toStrictEqual(['session runner', 'endpoint']);
});

test('it stops the parts a failed start registered, then rethrows its error', async () => {
  const stopped: string[] = [];

  const startTask = makeSystemTaskRunner({
    role: 'memory-writer',
    entry: 'main',
    start: (_options, session) => {
      session.defer(() => {
        stopped.push('endpoint');

        return Promise.resolve();
      });

      return Promise.reject(new Error('impd does not answer'));
    },
  });

  const start = startTask({
    models: modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: 'http://127.0.0.1:1',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'chat-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: buildStubSandboxes().adapter,
    image: 'nixie-conversation-0123456789ab',
  });

  await start.catch(() => {});

  expect(start).rejects.toThrowWithMessage(Error, 'impd does not answer');
  expect(stopped).toStrictEqual(['endpoint']);
});
