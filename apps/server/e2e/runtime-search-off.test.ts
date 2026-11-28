import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createTestClient, runHostCommand, startE2ENixie } from '@heynixie/server/test-utils';
import { z } from 'zod';

test('it registers no search tool and reports search off when the config has no search section', async () => {
  const nixie = await startE2ENixie({});

  const server = nixie.harness.start();

  const api = await createTestClient(server);
  const reply = await server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  const read = await api.client.nixie.read();

  expect({
    hasConversationTool: names.includes('task.start'),
    hasSearchTool: names.includes('search'),
    isSearchOn: read.features.includes('search'),
  }).toStrictEqual({ hasConversationTool: true, hasSearchTool: false, isSearchOn: false });
});

test('it refuses a config whose search section names no credential', async () => {
  const nixie = await startE2ENixie({ extraConfig: ['search:', '  daily_call_cap: 50'] });

  const run = await runHostCommand(nixie.configPath, [
    'sandbox-manifest',
    '--needed',
    '--manifest',
    join(nixie.directory, 'sandbox-manifest.json'),
  ]);

  expect({
    exitCode: run.exitCode,
    namesCredential: run.logged.some((line) => JSON.stringify(line).includes('search.credential')),
  }).toStrictEqual({ exitCode: 1, namesCredential: true });
});

test('it registers the search tool and reports search on when the config has a search section, so the checks above can fail', async () => {
  const nixie = await startE2ENixie({
    isVoiceOff: true,
    extraConfig: ['search:', '  credential: deployment:finder'],
    extraSecrets: ['connector_credentials:', '  finder: finder-test-key'],
  });

  const server = nixie.harness.start();

  const api = await createTestClient(server);
  const reply = await server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  const read = await api.client.nixie.read();

  expect({
    hasSearchTool: names.includes('search'),
    isSearchOn: read.features.includes('search'),
  }).toStrictEqual({ hasSearchTool: true, isSearchOn: true });
});
