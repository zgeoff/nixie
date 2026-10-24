import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter, withWriteTransaction, writeRecords } from '@heynixie/log';
import { promptsOverrideProposedCodec, writePromptProposalAnswer } from '@heynixie/prompts';
import { buildTestClock } from '@heynixie/testing';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { buildPromptChangeKind } from './build-prompt-change-kind';
import { checkPromptProposal } from './check-prompt-proposal';
import { createPathSource } from './create-path-source';
import { DefinitionsParseError } from './definitions-parse-error';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { runDefinitionsExports } from './run-definitions-exports';
import { runSeed } from './run-seed';
import { buildStubDefinitionsRepo } from './test-utils/build-stub-definitions-repo';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-prompt-exports-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(root);

  const writer = await startWriter({
    dataDir: directory,
    clock: { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() },
  });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };

  return {
    root,
    writer,
    log,
    source: createPathSource({ directory: root }),
    repo: buildStubDefinitionsRepo(root),
    answerContext: {
      log,
      clock: buildTestClock(Date.parse('2026-10-16T09:00:00Z')),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      readInForce: () => null,
      checkProposal: checkPromptProposal,
    },
  };
}

test('it opens a pull request with the part files and the prompts entry, which a seed applies after the merge', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), '# a test garden\nformat: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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

  const approved = await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  const result = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: 'Wren', ownerName: 'Morgan' })],
    onError: (error) => {
      throw error;
    },
  });

  const [pullRequest] = ctx.repo.readPullRequests();

  invariant(pullRequest);

  await ctx.repo.mergePullRequest(pullRequest.number);

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  invariant(approved.status === 'approved');

  expect(result).toStrictEqual({ exported: [approved.approvalID], closed: [] });

  expect(pullRequest).toMatchObject({
    state: 'open',
    change: {
      branch: 'nixie/prompt/compaction',
      title: 'Override the compaction prompt with the version Wren proposed',
      files: new Map([
        ['prompts/compaction-safety.md', 'Answer with the summary alone.\n'],
        [
          'nixie.yaml',
          '# a test garden\nformat: 3\nprompts:\n  compaction:\n    safety: "prompts/compaction-safety.md"\n',
        ],
      ]),
    },
  });

  expect(pullRequest.change.body).toMatchInlineSnapshot(`
    "Wren proposed this override of the \`compaction\` prompt, and Morgan approved it: approval \`${approved.approvalID}\`, proposal \`k3x9m2p7qa\`.

    The reason the proposal gives:

    > The summaries ramble past the word target.

    The override applies after this pull request merges and \`live\` is promoted.

    nixie.yaml held format 2, and the seed applies the prompts map only from format 3, so the change sets \`format: 3\`.

    The override replaces the built-in \`safety\` part of the \`compaction\` prompt, which holds its rules against text that tries to steer the model.
    "
  `);

  expect(inForce?.prompts).toStrictEqual({
    compaction: { parts: { safety: 'Answer with the summary alone.' }, template: null },
  });
});

test("it moves a part file that another prompt reads, and the seed after the merge leaves that prompt's text", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'prompts'));

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  writer:\n    instruction: prompts/shared.md\n',
  );

  await writeFile(join(ctx.root, 'prompts', 'shared.md'), 'Write each memory in one sentence.\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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
        entry: { instruction: 'prompts/shared.md' },
        files: [{ path: 'prompts/shared.md', text: 'Summarise the open questions first.\n' }],
        reason: 'The summaries bury the open questions.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })],
    onError: (error) => {
      throw error;
    },
  });

  const [pullRequest] = ctx.repo.readPullRequests();

  invariant(pullRequest);

  await ctx.repo.mergePullRequest(pullRequest.number);

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  expect(inForce?.prompts).toStrictEqual({
    writer: { parts: { instruction: 'Write each memory in one sentence.' }, template: null },
    compaction: {
      parts: { instruction: 'Summarise the open questions first.' },
      template: null,
    },
  });
});

test('it exports the edited entry and files that the approval holds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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

  await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
    entry: {
      instruction: 'prompts/compaction-instruction.md',
      _template: '{{ parts.instruction }}\n\n{{ parts.safety }}',
    },
    files: [{ path: 'prompts/compaction-instruction.md', text: 'Keep the open questions.\n' }],
  });

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })],
    onError: (error) => {
      throw error;
    },
  });

  expect(ctx.repo.readPullRequests().map((request) => request.change.files)).toStrictEqual([
    new Map([
      ['prompts/compaction-instruction.md', 'Keep the open questions.\n'],
      [
        'nixie.yaml',
        'format: 3\nprompts:\n  compaction:\n    instruction: "prompts/compaction-instruction.md"\n    _template: |-\n      {{ parts.instruction }}\n\n      {{ parts.safety }}\n',
      ],
    ]),
  ]);
});

test('it records the pull request on the thread of the proposal, for the answer the model reads', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const approved = await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })],
    onError: (error) => {
      throw error;
    },
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_exported'],
  });

  invariant(approved.status === 'approved');

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      thread: 'conversation',
      payload: {
        proposalID: 'k3x9m2p7qa',
        approvalID: approved.approvalID,
        pullRequestURL: 'https://definitions.test/pull/1',
      },
    },
  ]);
});

test('it exports each approval once', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  const kinds = [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })];

  await runDefinitionsExports({ log: ctx.log, repo: ctx.repo, kinds, onError: () => {} });

  const second = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds,
    onError: () => {},
  });

  expect(second).toStrictEqual({ exported: [], closed: [] });
  expect(ctx.repo.readPullRequests()).toHaveLength(1);
});

test('it records the pull request it already opened when an export mark outlives a lost answer', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const approved = await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  invariant(approved.status === 'approved');

  const kind = buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null });

  await runDefinitionsExports({ log: ctx.log, repo: ctx.repo, kinds: [kind], onError: () => {} });

  await withWriteTransaction(ctx.writer, (tx) =>
    kind.writeState(tx, { approvalID: approved.approvalID, to: 'exporting', at: 1 }),
  );

  const result = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [kind],
    onError: () => {},
  });

  const exports =
    await sql`select approval_id, state, pull_request_number from prompt_exports`.execute(
      ctx.writer.db,
    );

  const attempts = await sql`select approval_id from prompt_export_attempts`.execute(ctx.writer.db);

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_exported'],
  });

  expect(result).toStrictEqual({ exported: [approved.approvalID], closed: [] });
  expect(ctx.repo.readPullRequests().map((request) => request.number)).toStrictEqual([1]);

  expect(exports.rows).toStrictEqual([
    { approval_id: approved.approvalID, state: 'opened', pull_request_number: 1 },
  ]);

  expect(attempts.rows).toStrictEqual([]);

  expect(records.map((entry) => entry.record.payload['pullRequestURL'])).toStrictEqual([
    'https://definitions.test/pull/1',
  ]);
});

test('it opens one pull request when a retry follows a pull request write whose answer was lost', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const approved = await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  invariant(approved.status === 'approved');

  const kind = buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null });
  const errors: unknown[] = [];

  ctx.repo.loseNextAnswer();

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [kind],
    onError: (error) => {
      errors.push(error);
    },
  });

  const result = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [kind],
    onError: (error) => {
      throw error;
    },
  });

  const exports =
    await sql`select approval_id, state, pull_request_number from prompt_exports`.execute(
      ctx.writer.db,
    );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['prompts.override_exported'],
  });

  expect(errors).toStrictEqual([new Error('the answer to the pull request write was lost')]);
  expect(result).toStrictEqual({ exported: [approved.approvalID], closed: [] });
  expect(ctx.repo.readPullRequests().map((request) => request.number)).toStrictEqual([1]);

  expect(exports.rows).toStrictEqual([
    { approval_id: approved.approvalID, state: 'opened', pull_request_number: 1 },
  ]);

  expect(records.map((entry) => entry.record.payload['pullRequestURL'])).toStrictEqual([
    'https://definitions.test/pull/1',
  ]);
});

test('it writes a later approval of the same prompt onto its open pull request and closes the export before it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
    {
      kind: 'prompts.override_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: promptsOverrideProposedCodec.encode({
        proposalID: 'w7tn4c9rhz',
        promptID: 'compaction',
        proposalHash: 'hash-b',
        baseHash: null,
        entry: { _template: '{{ parts.instruction }}\n{{ parts.safety }}' },
        files: [],
        reason: 'Keep both parts on their own lines.',
        provenance: { runID: 'run-1', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const kinds = [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })];

  const first = await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  await runDefinitionsExports({ log: ctx.log, repo: ctx.repo, kinds, onError: () => {} });

  const second = await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'w7tn4c9rhz',
    proposalHash: 'hash-b',
  });

  const result = await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds,
    onError: () => {},
  });

  const exports = await sql`select approval_id, state from prompt_exports
    order by updated_at, approval_id`.execute(ctx.writer.db);

  invariant(first.status === 'approved' && second.status === 'approved');

  expect(result).toStrictEqual({ exported: [second.approvalID], closed: [first.approvalID] });

  expect(ctx.repo.readPullRequests()).toMatchObject([
    {
      number: 1,
      state: 'open',
      change: {
        files: new Map([
          [
            'nixie.yaml',
            'format: 3\nprompts:\n  compaction:\n    _template: |-\n      {{ parts.instruction }}\n      {{ parts.safety }}\n',
          ],
        ]),
      },
    },
  ]);

  expect(exports.rows).toIncludeSameMembers([
    { approval_id: first.approvalID, state: 'closed' },
    { approval_id: second.approvalID, state: 'opened' },
  ]);
});

test('it passes an export to onError when the definitions repo has no manifest', async () => {
  const ctx = await setupTest();

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
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  const errors: unknown[] = [];

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })],
    onError: (error) => {
      errors.push(error);
    },
  });

  expect(errors).toStrictEqual([
    new Error('the definitions repo holds no nixie.yaml to add the prompt override to'),
  ]);

  expect(ctx.repo.readPullRequests()).toStrictEqual([]);
});

test('it passes an export to onError when the files on the base branch leave no room for the override', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await mkdir(join(ctx.root, 'prompts'));
  await writeFile(join(ctx.root, 'prompts', 'bulk.md'), 'a'.repeat(10_485_700));

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
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  const errors: unknown[] = [];

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })],
    onError: (error) => {
      errors.push(error);
    },
  });

  expect(errors).toStrictEqual([
    new Error(
      'the compaction override takes the definitions to 10485769 bytes, past the 10485760-byte limit the seed keeps to',
    ),
  ]);

  expect(ctx.repo.readPullRequests()).toStrictEqual([]);
});

test('it passes an export to onError when the definitions after the change fail to parse', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  compaction:\n    instruction: rules/compaction.json\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'rules'));
  await writeFile(join(ctx.root, 'rules', 'compaction.json'), 'Keep the open questions.\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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
        entry: { _template: '{{ parts.safety }}' },
        files: [],
        reason: 'Drop the instruction part.',
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  const errors: unknown[] = [];

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })],
    onError: (error) => {
      errors.push(error);
    },
  });

  const [error] = errors;

  invariant(error instanceof DefinitionsParseError);

  expect(errors).toHaveLength(1);

  expect(error.problems).toStrictEqual([
    { path: 'rules/compaction.json', reason: expect.any(String) },
  ]);

  expect(ctx.repo.readPullRequests()).toStrictEqual([]);
});

test('it opens a pull request beside a file that the seed skips, such as a hidden file in the skills folder', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills'));
  await writeFile(join(ctx.root, 'skills', '.gitkeep'), '');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
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

  await writePromptProposalAnswer(ctx.answerContext, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    proposalHash: 'hash-a',
  });

  await runDefinitionsExports({
    log: ctx.log,
    repo: ctx.repo,
    kinds: [buildPromptChangeKind(ctx.log, { agentName: null, ownerName: null })],
    onError: (error) => {
      throw error;
    },
  });

  expect(ctx.repo.readPullRequests().map((request) => request.change.files)).toStrictEqual([
    new Map([
      ['prompts/compaction-safety.md', 'Answer with the summary alone.\n'],
      [
        'nixie.yaml',
        'format: 3\nprompts:\n  compaction:\n    safety: "prompts/compaction-safety.md"\n',
      ],
    ]),
  ]);
});
