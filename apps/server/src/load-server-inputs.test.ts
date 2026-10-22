import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { loadServerInputs } from './load-server-inputs';
import { writeBootFiles } from './test-utils/write-boot-files';

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
