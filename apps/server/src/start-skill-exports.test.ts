import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkSkillFiles,
  createPathSource,
  runSeed,
  runWrittenSkillSeed,
  writeWrittenSkill,
} from '@heynixie/definitions';
import {
  createMockGitHubRepo,
  githubAPIURL,
  githubStore,
} from '@heynixie/definitions-github/mocks';
import { withWriteTransaction } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildCleanup } from './build-cleanup';
import { loadServerInputs } from './load-server-inputs';
import { startSkillExports } from './start-skill-exports';
import { startTestLog } from './test-utils/start-test-log';
import { writeBootFiles } from './test-utils/write-boot-files';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-exports-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const dataDir = await mkdtemp(join(directory, 'log-'));
  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const cleanup = buildCleanup();

  stack.defer(() => cleanup.stop());

  return { directory, log, cleanup };
}

test('it exports a skill with the configured templates, the first agent name and the resolved owner name', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: ['agent:', '  names: [Wren, Robin]', 'owner:', '  name: deployment:owner_name'],
    secrets: ['definitions_export_token: token-a', 'settings:', '  owner_name: Morgan'],
    definitions: [
      'export:',
      '  repository: harbour/definitions',
      `  api_url: ${githubAPIURL}`,
      "  title: 'skills: {operation} {skill} by {agent}'",
      "  message: '{owner} approved proposal {proposal}.'",
    ],
  });

  await writeFile(join(ctx.directory, 'definitions', 'nixie.yaml'), 'format: 2\n');

  const policy = { rules: [], tools: [] };

  await runSeed({
    log: ctx.log,
    source: createPathSource({ directory: join(ctx.directory, 'definitions') }),
    policy,
  });

  const skill = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  await startSkillExports({
    log: ctx.log,
    settings: inputs.definitionsExport,
    cleanup: ctx.cleanup,
    logEvent: mock<Logger>(),
  });

  await waitForCondition(() => githubStore.pulls.all().length > 0);

  expect(githubStore.pulls.all()).toMatchObject([
    {
      repository: 'harbour/definitions',
      head: 'nixie/skill/tide-tables',
      title: 'skills: add tide-tables by Wren',
      body: 'Morgan approved proposal k3vq8m2xpa.',
    },
  ]);

  const head = githubStore.refs.findFirst((query) =>
    query.where({ repository: 'harbour/definitions', branch: 'nixie/skill/tide-tables' }),
  );

  invariant(head);

  expect(githubStore.commits.findFirst((query) => query.where({ sha: head.sha }))?.message).toBe(
    'skills: add tide-tables by Wren\n\nMorgan approved proposal k3vq8m2xpa.',
  );
});
