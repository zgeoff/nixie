import { expect, mock, onTestFinished, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { systemClock } from '@heynixie/clock';
import {
  checkPromptProposal,
  checkSkillFiles,
  createPathSource,
  runInForceSeed,
  runSeed,
  writeRuntimeRule,
  writeWrittenSkill,
} from '@heynixie/definitions';
import {
  createMockGitHubRepo,
  githubAPIURL,
  githubStore,
  readMockFiles,
  writeMockBranchFile,
} from '@heynixie/definitions-repo-github/mocks';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { network } from '@heynixie/mock-server';
import {
  promptsOverrideProposedCodec,
  readPromptProposals,
  writePromptApproval,
} from '@heynixie/prompts';
import { waitForCondition } from '@heynixie/testing';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { buildCleanup } from '../server/build-cleanup';
import { loadServerInputs } from '../server/load-server-inputs';
import { startTestLog } from '../test-utils/start-test-log';
import { writeBootFiles } from '../test-utils/write-boot-files';
import { startDefinitionsExports } from './start-definitions-exports';

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

  const exportWithApp = async (registerHandlers: () => void) => {
    const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });

    const files = await writeBootFiles(directory, 'http://127.0.0.1:4010', {
      config: ['agent:', '  names: [Wren]'],
      secrets: [
        'definitions_export_app_key: |',
        ...privateKey
          .trimEnd()
          .split('\n')
          .map((line) => `  ${line}`),
      ],
      definitions: [
        'export:',
        '  repository: harbour/definitions',
        `  api_url: ${githubAPIURL}`,
        '  app:',
        '    client_id: Iv1.harbour',
        '    installation_id: 4242',
      ],
    });

    registerHandlers();

    await writeFile(join(directory, 'definitions', 'nixie.yaml'), 'format: 2\n');

    const policy = { rules: [], tools: [] };

    await runSeed({
      tasks: buildTestTaskSeed(),
      log,
      source: createPathSource({ directory: join(directory, 'definitions') }),
      buildPolicy: () => policy,
    });

    const skill = checkSkillFiles('tide-tables', [
      { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
    ]);

    invariant('skillHash' in skill);

    await withWriteTransaction(log.writer, (tx) =>
      writeWrittenSkill(tx, {
        approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
        proposalID: 'k3vq8m2xpa',
        skill,
        approvedAt: 1,
      }),
    );

    await runInForceSeed({ log, buildPolicy: () => policy });

    const inputs = await loadServerInputs({
      configPath: files.configPath,
      manifestPath: files.manifestPath,
      sopsArgv: [files.sopsPath],
      log: mock<Logger>(),
    });

    const logEvent = mock<Logger>();

    await startDefinitionsExports({
      log,
      tasks: buildTestTaskSeed(),
      settings: inputs.definitionsExport,
      cleanup,
      logEvent,
    });

    await waitForCondition(() => logEvent.mock.calls.length > 0);

    return { logged: JSON.stringify(logEvent.mock.calls), privateKey };
  };

  return { directory, log, cleanup, exportWithApp };
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
    tasks: buildTestTaskSeed(),
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

  await runInForceSeed({ log: ctx.log, buildPolicy: () => policy });
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  await startDefinitionsExports({
    log: ctx.log,
    tasks: buildTestTaskSeed(),
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

test('it exports a runtime rule change in a pull request on the rules branch', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: ['agent:', '  names: [Wren]'],
    secrets: ['definitions_export_token: token-a'],
    definitions: ['export:', '  repository: harbour/definitions', `  api_url: ${githubAPIURL}`],
  });

  const definitions = join(ctx.directory, 'definitions');

  await writeFile(join(definitions, 'nixie.yaml'), 'format: 3\n');
  await mkdir(join(definitions, 'rules'));
  await writeFile(join(definitions, 'rules', 'mail.yaml'), 'ask-mail:\n  outcome: ask\n');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: createPathSource({ directory: definitions }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'nixie.yaml',
    text: 'format: 3\n',
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'persona.md',
    text: '# Persona\n',
  });

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'rules/mail.yaml',
    text: 'ask-mail:\n  outcome: ask\n',
  });

  await writeRuntimeRule(
    {
      log: ctx.log,
      clock: systemClock,
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      runInForceSeed: () =>
        runInForceSeed({ log: ctx.log, buildPolicy: () => ({ rules: [], tools: [] }) }),
    },
    {
      ruleID: 'ask-mail',
      rule: { outcome: 'deny', tools: ['mail.send'] },
      changedBy: 'owner',
      reason: 'No mail this week.',
    },
  );

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  await startDefinitionsExports({
    log: ctx.log,
    tasks: buildTestTaskSeed(),
    settings: inputs.definitionsExport,
    cleanup: ctx.cleanup,
    logEvent: mock<Logger>(),
  });

  await waitForCondition(() => githubStore.pulls.all().length > 0);

  expect(readMockFiles('harbour/definitions', 'nixie/rules')).toStrictEqual({
    'nixie.yaml': 'format: 3\n',
    'persona.md': '# Persona\n',
    'rules/mail.yaml': 'ask-mail:\n  outcome: "deny"\n  tools: ["mail.send"]\n',
  });
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
    tasks: buildTestTaskSeed(),
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

  await writeMockBranchFile({
    repository: 'harbour/definitions',
    branch: 'main',
    path: 'persona.md',
    text: '# Persona\n',
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

  await withWriteTransaction(ctx.log.writer, async (tx) => {
    const [state] = await readPromptProposals(tx, ['k3x9m2p7qa']);

    invariant(state, 'the proposal was written');

    return writePromptApproval(
      tx,
      {
        log: ctx.log,
        clock: systemClock,
        definitions: () => ({ snapshotHash: 'snapshot-a' }),
        readInForce: () => null,
        checkProposal: checkPromptProposal,
      },
      { state, entry: state.proposal.entry, files: state.proposal.files, identityID: 'owner' },
    );
  });

  const inputs = await loadServerInputs({
    configPath: files.configPath,
    manifestPath: files.manifestPath,
    sopsArgv: [files.sopsPath],
    log: mock<Logger>(),
  });

  await startDefinitionsExports({
    log: ctx.log,
    tasks: buildTestTaskSeed(),
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
    'persona.md': '# Persona\n',
    'prompts/compaction-safety.md': 'Answer with the summary alone.\n',
  });
});

test('it logs no key, JWT or token when the App cannot mint an installation token', async () => {
  const ctx = await setupTest();

  const bearers: string[] = [];

  const outcome = await ctx.exportWithApp(() => {
    network.use(
      http.post(`${githubAPIURL}/app/installations/4242/access_tokens`, (info) => {
        const authorization = info.request.headers.get('authorization') ?? '';

        bearers.push(authorization);

        return HttpResponse.json({ message: `Bad credentials: ${authorization}` }, { status: 401 });
      }),
    );
  });

  const jwt = bearers[0]?.replace('Bearer ', '') ?? '';

  expect(jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/u);
  expect(outcome.logged).toInclude('definitions.export_failed');
  expect(outcome.logged).toInclude('401');
  expect(outcome.logged).not.toInclude(jwt);
  expect(outcome.logged).not.toInclude('PRIVATE KEY');
  expect(outcome.logged).not.toInclude(outcome.privateKey.split('\n')[1] ?? '');
});

test('it logs no installation token when a repository request fails and echoes it', async () => {
  const ctx = await setupTest();

  const installationToken = 'inst-tok-harbour-7f3a91c2';

  const outcome = await ctx.exportWithApp(() => {
    network.use(
      http.post(`${githubAPIURL}/app/installations/4242/access_tokens`, () =>
        HttpResponse.json({
          token: installationToken,
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      ),
      http.all(`${githubAPIURL}/repos/*`, (info) =>
        HttpResponse.json(
          { message: `Server error for ${info.request.headers.get('authorization')}` },
          { status: 500 },
        ),
      ),
    );
  });

  expect(outcome.logged).toInclude('definitions.export_failed');
  expect(outcome.logged).toInclude('500');
  expect(outcome.logged).not.toInclude(installationToken);
  expect(outcome.logged).not.toInclude('PRIVATE KEY');
  expect(outcome.logged).not.toInclude(outcome.privateKey.split('\n')[1] ?? '');
});
