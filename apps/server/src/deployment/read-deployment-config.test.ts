import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDeploymentConfig } from './read-deployment-config';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-config-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'config.yaml') };
}

test('it loads a file with a key no module reads, and names the key', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: chat-direct',
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
      'modles: {}',
    ].join('\n'),
  );

  const loaded = await readDeploymentConfig(ctx.path);

  expect(loaded.unknownKeys).toStrictEqual(['modles']);
});

test('it loads a file with an unknown key inside a module’s section, and names its path', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: chat-direct',
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
      'tasks:',
      '  runner: 5',
      '  runners: 2',
    ].join('\n'),
  );

  const loaded = await readDeploymentConfig(ctx.path);

  expect({ runners: loaded.config.tasks.runners, unknownKeys: loaded.unknownKeys }).toStrictEqual({
    runners: 2,
    unknownKeys: ['tasks.runner'],
  });
});

test('it refuses a server ID that is the first segment of a tool nixie registers', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: chat-direct',
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
      'mcp:',
      '  servers:',
      '    web:',
      '      url: https://tracker.example.org/mcp',
      '      clientID: nixie-7f3a',
      '      scope: read',
    ].join('\n'),
  );

  expect(readDeploymentConfig(ctx.path)).rejects.toThrow(/mcp\.servers\.web/u);
});
