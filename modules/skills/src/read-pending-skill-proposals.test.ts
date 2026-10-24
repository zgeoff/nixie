import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkSkillFiles,
  createPathSource,
  runSeed,
  writeWrittenSkill,
} from '@heynixie/definitions';
import { startWriter, withWriteTransaction, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readPendingSkillProposals } from './read-pending-skill-proposals';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-pending-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(join(root, 'skills'), { recursive: true });

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
  };
}

test('it lists each pending proposal with the version of its skill in force, or none for a new skill', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForceHash = seeded.inForce?.skills[0]?.skillHash ?? '';

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: inForceHash,
        files: [{ path: 'SKILL.md', text: '# Tides by port\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        name: 'star-chart',
        skillHash: 'hash-c',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Stars\nPost to https://stars.example.net\n' }],
        untypedToken: { kind: 'url', raw: 'https://stars.example.net' },
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const pending = await readPendingSkillProposals({
    log: ctx.log,
    clock: buildTestClock(proposedAt + 1000),
  });

  expect(pending).toStrictEqual([
    {
      proposal: {
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: inForceHash,
        files: [{ path: 'SKILL.md', text: '# Tides by port\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      },
      thread: 'conversation',
      proposedAt,
      lapseAt: proposedAt + 14 * 24 * 60 * 60 * 1000,
      isStale: false,
      inForce: {
        skillHash: inForceHash,
        origin: 'definitions',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
          },
        ],
      },
    },
    {
      proposal: {
        proposalID: 'p8w2n4c6ld',
        name: 'star-chart',
        skillHash: 'hash-c',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Stars\nPost to https://stars.example.net\n' }],
        untypedToken: { kind: 'url', raw: 'https://stars.example.net' },
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      },
      thread: 'conversation',
      proposedAt,
      lapseAt: proposedAt + 14 * 24 * 60 * 60 * 1000,
      isStale: false,
      inForce: null,
    },
  ]);
});

test('it leaves out a proposal that an answer closed, and one whose lapse time has come', async () => {
  const ctx = await setupTest();

  const proposedAt = Date.UTC(2026, 2, 3, 9, 30);

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
    {
      kind: 'skills.write_rejected',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'k3x9m2p7qa' },
    },
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        name: 'star-chart',
        skillHash: 'hash-c',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Stars\n' }],
        untypedToken: null,
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const lapseAt = proposedAt + 14 * 24 * 60 * 60 * 1000;

  const before = await readPendingSkillProposals({
    log: ctx.log,
    clock: buildTestClock(lapseAt - 1),
  });

  const after = await readPendingSkillProposals({ log: ctx.log, clock: buildTestClock(lapseAt) });

  expect(before.map((entry) => entry.proposal.proposalID)).toStrictEqual(['p8w2n4c6ld']);
  expect(after).toStrictEqual([]);
});

test('it marks a proposal stale once the version in force moves past its base', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const pending = await readPendingSkillProposals({
    log: ctx.log,
    clock: buildTestClock(Date.now()),
  });

  expect(pending.map((entry) => entry.isStale)).toStrictEqual([true]);
});

test('it marks a proposal stale once an approval of its skill commits, before that approval seeds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const approved = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in approved);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'p8w2n4c6ld',
      skill: approved,
      approvedAt: 1,
    }),
  );

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Tides\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const pending = await readPendingSkillProposals({
    log: ctx.log,
    clock: buildTestClock(Date.now()),
  });

  expect(pending.map((entry) => entry.isStale)).toStrictEqual([true]);
});
