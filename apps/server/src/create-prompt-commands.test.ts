import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createMockGitHubRepo,
  githubAPIURL,
  githubStore,
  readMockFiles,
  writeMockBranchFile,
} from '@heynixie/definitions-github/mocks';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createPromptCommands } from './create-prompt-commands';
import { readCLIArgs } from './read-cli-args';
import { buildRecordingHostTransport } from './test-utils/build-recording-host-transport';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';
import { startTestControlSocket } from './test-utils/start-test-control-socket';

test('it lists a prompt proposal, approves it into a pull request, and the next turn names the pull request', async () => {
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

  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export:',
      '  repository: harbour/definitions',
      `  api_url: ${githubAPIURL}`,
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'prompt_write',
        input: {
          id: 'compaction',
          entry: { safety: 'prompts/compaction-safety.md' },
          files: [
            { path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' },
          ],
          reason: 'The summaries ramble past the word target.',
        },
      },
    },
    { text: 'Proposed.' },
    { text: 'Noted.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Make the summaries shorter.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Proposed.');
  });

  const listed = await runHostCommand(nixie.configPath, ['prompt-pending']);

  const [{ proposalID, proposalHash }] = z
    .tuple([z.object({ proposalID: z.string(), proposalHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  await runHostCommand(nixie.configPath, ['prompt-approve', proposalID, '--hash', proposalHash]);
  await waitForCondition(() => githubStore.pulls.all().length > 0);

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Any news on that?',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });

  expect(JSON.parse(listed.stdout)).toMatchObject([
    {
      proposalID,
      promptID: 'compaction',
      entry: { safety: 'prompts/compaction-safety.md' },
      files: [{ path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' }],
      reason: 'The summaries ramble past the word target.',
      inForce: null,
      isStale: false,
    },
  ]);

  expect(readMockFiles('harbour/definitions', 'nixie/prompt/compaction')).toStrictEqual({
    'nixie.yaml':
      'format: 3\nprompts:\n  compaction:\n    safety: "prompts/compaction-safety.md"\n',
    'persona.md': '# Persona\n',
    'prompts/compaction-safety.md': 'Answer with the summary alone.\n',
  });

  expect(nixie.guest.turns.at(-1)?.input).toMatchObject([
    {
      text: expect.toInclude(
        `opened https://github.test/harbour/definitions/pull/1 with your prompt proposal ${proposalID} (compaction). The override applies after that pull request merges and live is promoted in the definitions repo.`,
      ),
    },
  ]);
});

test('it approves a prompt proposal with the edits that --entry and --files give, and exports the edits', async () => {
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

  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export:',
      '  repository: harbour/definitions',
      `  api_url: ${githubAPIURL}`,
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'prompt_write',
        input: {
          id: 'compaction',
          entry: { safety: 'prompts/compaction-safety.md' },
          files: [
            { path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' },
          ],
          reason: 'The summaries ramble past the word target.',
        },
      },
    },
    { text: 'Proposed.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Make the summaries shorter.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Proposed.');
  });

  const listed = await runHostCommand(nixie.configPath, ['prompt-pending']);

  const [{ proposalID, proposalHash }] = z
    .tuple([z.object({ proposalID: z.string(), proposalHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  const approved = await runHostCommand(nixie.configPath, [
    'prompt-approve',
    proposalID,
    '--hash',
    proposalHash,
    '--entry',
    '{"safety":"prompts/compaction-short.md"}',
    '--files',
    String.raw`[{"path":"prompts/compaction-short.md","text":"Answer in one line.\n"}]`,
  ]);

  await waitForCondition(() => githubStore.pulls.all().length > 0);

  expect(approved.exitCode).toBe(0);

  expect(JSON.parse(approved.stdout)).toStrictEqual({
    proposalID,
    approvalID: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    proposalHash: expect.toSatisfy(
      (hash: string) => /^[0-9a-f]{64}$/u.test(hash) && hash !== proposalHash,
    ),
  });

  expect(readMockFiles('harbour/definitions', 'nixie/prompt/compaction')).toStrictEqual({
    'nixie.yaml': 'format: 3\nprompts:\n  compaction:\n    safety: "prompts/compaction-short.md"\n',
    'persona.md': '# Persona\n',
    'prompts/compaction-short.md': 'Answer in one line.\n',
  });
});

test('it rejects a prompt proposal with its reason, which the model reads, and the proposal leaves the pending list', async () => {
  await createMockGitHubRepo({ repository: 'harbour/definitions', base: 'main', token: 'token-a' });

  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export:',
      '  repository: harbour/definitions',
      `  api_url: ${githubAPIURL}`,
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'prompt_write',
        input: {
          id: 'compaction',
          entry: { safety: 'prompts/compaction-safety.md' },
          files: [
            { path: 'prompts/compaction-safety.md', text: 'Answer with the summary alone.\n' },
          ],
          reason: 'The summaries ramble past the word target.',
        },
      },
    },
    { text: 'Proposed.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Make the summaries shorter.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Proposed.');
  });

  const listed = await runHostCommand(nixie.configPath, ['prompt-pending']);

  const [{ proposalID, proposalHash }] = z
    .tuple([z.object({ proposalID: z.string(), proposalHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  const rejected = await runHostCommand(nixie.configPath, [
    'prompt-reject',
    proposalID,
    '--hash',
    proposalHash,
    '--reason',
    'Keep the built-in safety part.',
  ]);

  const pending = await runHostCommand(nixie.configPath, ['prompt-pending']);

  nixie.guest.addReplies({ text: 'Noted.' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Any news on that?',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Noted.');
  });

  expect(rejected.exitCode).toBe(0);
  expect(JSON.parse(rejected.stdout)).toStrictEqual({ proposalID });
  expect(JSON.parse(pending.stdout)).toStrictEqual([]);

  expect(nixie.guest.turns.at(-1)?.input).toMatchObject([
    {
      text: expect.toInclude(
        `rejected your prompt proposal ${proposalID} (compaction). Reason: "Keep the built-in safety part.".`,
      ),
    },
  ]);
});

test('it sends the pending request to the socket of the config over the host transport it is given', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompts-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const socketPath = join(directory, 'control.sock');

  await startTestControlSocket({ path: socketPath });

  const host = buildRecordingHostTransport(socketPath);

  const commands = new Map(createPromptCommands(host.transport));

  const parsed = await readCLIArgs(
    ['prompt-pending', '--config', '/etc/nixie/config.yaml'],
    [...commands.keys()],
  );

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(0);

  expect(host.record).toStrictEqual({
    configPaths: ['/etc/nixie/config.yaml'],
    requests: [{ socketPath, name: 'prompt pending' }],
  });

  expect(io.print).toHaveBeenCalledExactlyOnceWith('[]');
});

test('it refuses a prompt approval with no --hash, and reaches no server', async () => {
  const host = buildRecordingHostTransport('/run/nixie/control.sock');

  const commands = new Map(createPromptCommands(host.transport));

  const parsed = await readCLIArgs(['prompt-approve', 'p8w2n4c6ld'], [...commands.keys()]);

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie prompt-approve takes a proposal ID, --hash <proposal hash> and, for an edit, ' +
      '--entry <JSON map of part to file path, and _template> and ' +
      '--files <JSON list of path and text>',
  );

  expect(host.record).toStrictEqual({ configPaths: [], requests: [] });
});

test('it refuses an edited entry that is not a JSON map of strings, and reaches no server', async () => {
  const host = buildRecordingHostTransport('/run/nixie/control.sock');

  const commands = new Map(createPromptCommands(host.transport));

  const parsed = await readCLIArgs(
    ['prompt-approve', 'p8w2n4c6ld', '--hash', 'hash-a', '--entry', '{"safety":3}'],
    [...commands.keys()],
  );

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie prompt-approve takes a proposal ID, --hash <proposal hash> and, for an edit, ' +
      '--entry <JSON map of part to file path, and _template> and ' +
      '--files <JSON list of path and text>',
  );

  expect(host.record).toStrictEqual({ configPaths: [], requests: [] });
});

test('it refuses a prompt rejection with no --reason, and reaches no server', async () => {
  const host = buildRecordingHostTransport('/run/nixie/control.sock');

  const commands = new Map(createPromptCommands(host.transport));

  const parsed = await readCLIArgs(
    ['prompt-reject', 'p8w2n4c6ld', '--hash', 'hash-a'],
    [...commands.keys()],
  );

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie prompt-reject takes a proposal ID, --hash <proposal hash> and --reason <why>',
  );

  expect(host.record).toStrictEqual({ configPaths: [], requests: [] });
});
