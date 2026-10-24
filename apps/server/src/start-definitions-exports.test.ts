import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPromptProposal,
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
  readMockFiles,
  writeMockBranchFile,
} from '@heynixie/definitions-github/mocks';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { promptsOverrideProposedCodec, writePromptProposalAnswer } from '@heynixie/prompts';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildCleanup } from './build-cleanup';
import { loadServerInputs } from './load-server-inputs';
import { startDefinitionsExports } from './start-definitions-exports';
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
    buildPolicy: () => policy,
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

  await runWrittenSkillSeed({ log: ctx.log, buildPolicy: () => policy });
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  await startDefinitionsExports({
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

test("it exports an approved prompt override beside the skills, with the part files and the definitions repo's nixie.yaml", async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: ['agent:', '  names: [Wren]'],
    secrets: ['definitions_export_token: token-a'],
    definitions: ['export:', '  repository: harbour/definitions', `  api_url: ${githubAPIURL}`],
  });

  await writeFile(join(ctx.directory, 'definitions', 'nixie.yaml'), 'format: 3\n');

  await runSeed({
    log: ctx.log,
    source: createPathSource({ directory: join(ctx.directory, 'definitions') }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 3\n',
  });

  await writeRecords(ctx.log, [
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        proposalHash: 'hash-a',
        baseHash: null,
        entry: { safety: 'prompts/compaction-safety.md' },
        files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
        reason: 'The summaries ramble past the word target.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writePromptProposalAnswer(
    {
      log: ctx.log,
      clock: { now: () => Date.now() },
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: checkPromptProposal,
    },
    { answer: 'approve', proposalID: 'k3x9m2p7qa', proposalHash: 'hash-a' },
  );

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  await startDefinitionsExports({
    log: ctx.log,
    settings: inputs.definitionsExport,
    cleanup: ctx.cleanup,
    logEvent: mock<Logger>(),
  });

  await waitForCondition(() => githubStore.pulls.all().length > 0);

  expect(githubStore.pulls.all()).toMatchObject([
    {
      repository: 'harbour/definitions',
      head: 'nixie/prompt/compaction',
      title: 'Override the compaction prompt with the version Wren proposed',
    },
  ]);

  expect(readMockFiles('harbour/definitions', 'nixie/prompt/compaction')).toStrictEqual({
    'nixie.yaml':
      'format: 3\nprompts:\n  compaction:\n    safety: "prompts/compaction-safety.md"\n',
    'prompts/compaction-safety.md': 'Answer with the summary alone.\n',
  });
});
