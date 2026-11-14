import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { writeBootFiles } from '../test-utils/write-boot-files';
import { loadServerInputs } from './load-server-inputs';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-server-inputs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it resolves the export text from the templates, the first agent name and the resolved owner name', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: ['agent:', '  names: [Wren, Robin]', 'owner:', '  name: deployment:owner_name'],
    secrets: ['definitions_export_token: token-a', 'settings:', '  owner_name: Morgan'],
    definitions: [
      'export:',
      '  repository: harbour/definitions',
      "  title: 'skills: {operation} {skill}'",
      "  message: '{agent} wrote it for {owner}.'",
    ],
  });

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  expect(inputs.definitionsExport?.text).toStrictEqual({
    title: 'skills: {operation} {skill}',
    message: '{agent} wrote it for {owner}.',
    agentName: 'Wren',
    ownerName: 'Morgan',
  });
});

test('it refuses a manifest that lacks the image a part needs, before any image is used', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  await writeFile(
    files.manifestPath,
    JSON.stringify({ conversation: `ghcr.io/example/nixie-conversation@sha256:${'a'.repeat(64)}` }),
  );

  expect(
    loadServerInputs({
      configPath: files.configPath,
      manifestPath: files.manifestPath,
      sopsArgv: [files.sopsPath],
      log: mock<Logger>(),
    }),
  ).rejects.toThrow(
    'nixie refuses to start: the web_fetch part needs the fetch image, and the sandbox manifest holds conversation',
  );
});

test('it gives the images that the profiles and the parts need', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  expect(Object.keys(inputs.images)).toStrictEqual(['conversation', 'fetch']);
});

test('it logs a warning that names each config key it does not know', async () => {
  const ctx = await setupTest();

  const log = mock<Logger>();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: ['modles: {}', 'tasks:', '  runner: 5'],
    secrets: [],
  });

  await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log,
  });

  const warnings = log.mock.calls.filter(([event]) => event === 'config.unknown_key');

  expect(warnings).toStrictEqual([
    ['config.unknown_key', { key: 'modles' }, 'warn'],
    ['config.unknown_key', { key: 'tasks.runner' }, 'warn'],
  ]);
});
