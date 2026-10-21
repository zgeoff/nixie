import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildSkillTools } from './build-skill-tools';
import { skillsWriteApprovedCodec } from './skills-write-approved-codec';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';
import { writeSkillProposalAnswer } from './write-skill-proposal-answer';
import { writeSkillProposalLapses } from './write-skill-proposal-lapses';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-pending-tool-'));

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

test('it lists each proposal that skill_write made, oldest first, as a new skill or a new version with its age', async () => {
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
    policy: { rules: [], tools: [] },
  });

  setSystemTime(new Date(proposedAt));
  onTestFinished(() => setSystemTime());

  const registry = buildToolRegistry(
    buildSkillTools({
      log: ctx.log,
      clock: buildTestClock(proposedAt + 3 * 24 * 60 * 60 * 1000),
      readInForce: () => seeded.inForce,
      refreshDefinitions: () => Promise.resolve(seeded.inForce),
      readSkillList: () => [],
    }),
  );

  const write = registry.findTool('skill_write');
  const pending = registry.findTool('skill_pending');

  invariant(write);
  invariant(pending);

  const run = {
    runID: 'run-1',
    thread: 'conversation',
    tools: [],
    model: { model: 'test-model', profile: 'standard' },
  };

  const written: string[] = [];

  for (const [index, name] of ['star-chart', 'tide-tables'].entries()) {
    const outcome = await write.definition.run(
      {
        callID: `call-${String(index + 1)}`,
        tool: 'skill_write',
        input: {
          name,
          files: [
            {
              path: 'SKILL.md',
              text: `---\nname: ${name}\ndescription: Reads a chart by port.\n---\n# By port\n`,
            },
          ],
        },
        toolUseID: null,
      },
      { run },
    );

    invariant(outcome.status === 'ok');

    const proposalID = outcome.result['proposalID'];

    invariant(typeof proposalID === 'string');

    written.push(proposalID);
  }

  const outcome = await pending.definition.run(
    { callID: 'call-3', tool: 'skill_pending', input: {}, toolUseID: null },
    { run },
  );

  const [newID, versionID] = written;

  const replacedHash = seeded.inForce?.skills.find(
    (skill) => skill.name === 'tide-tables',
  )?.skillHash;

  invariant(outcome.status === 'ok');
  invariant(newID !== undefined && versionID !== undefined && replacedHash !== undefined);

  expect(outcome.result).toStrictEqual({
    proposals: [
      { proposalID: newID, name: 'star-chart', change: 'new', age: '3 days' },
      {
        proposalID: versionID,
        name: 'tide-tables',
        change: 'new_version',
        version: replacedHash,
        age: '3 days',
      },
    ],
  });

  expect(pending.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test('it declares read, runs direct, and writes no record, so it never changes a proposal', async () => {
  const ctx = await setupTest();

  const clock = buildTestClock(Date.now());

  const registry = buildToolRegistry(
    buildSkillTools({
      log: ctx.log,
      clock,
      readInForce: () => null,
      refreshDefinitions: () => Promise.resolve(null),
      readSkillList: () => [],
    }),
  );

  const pending = registry.findTool('skill_pending');

  invariant(pending);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'star-chart',
        skillHash: 'hash-b',
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Stars\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const before = await readRecords(ctx.log, { afterSequence: 0 });

  const call = { callID: 'call-2', tool: 'skill_pending', input: {}, toolUseID: null };

  const run = {
    runID: 'run-1',
    thread: 'conversation',
    tools: [],
    model: { model: 'test-model', profile: 'standard' },
  };

  const first = await pending.definition.run(call, { run });
  const second = await pending.definition.run(call, { run });
  const after = await readRecords(ctx.log, { afterSequence: 0 });

  expect([pending.definition.declaration, pending.definition.execution]).toStrictEqual([
    {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { proposals: 'untrusted' },
    },
    'direct',
  ]);

  expect(second).toStrictEqual(first);

  expect(first).toMatchObject({
    status: 'ok',
    result: { proposals: [{ proposalID: 'k3x9m2p7qa' }] },
    record: { proposals: [{ proposalID: 'k3x9m2p7qa' }] },
  });

  expect(after).toStrictEqual(before);
});

test('it leaves out a proposal that an approval, a rejection or a lapse closed', async () => {
  const ctx = await setupTest();

  const firstAt = Date.UTC(2026, 2, 3, 9, 30);
  const laterAt = firstAt + 10 * 24 * 60 * 60 * 1000;
  const now = firstAt + 15 * 24 * 60 * 60 * 1000;
  const clock = buildTestClock(now);

  onTestFinished(() => setSystemTime());

  const registry = buildToolRegistry(
    buildSkillTools({
      log: ctx.log,
      clock,
      readInForce: () => null,
      refreshDefinitions: () => Promise.resolve(null),
      readSkillList: () => [],
    }),
  );

  const pending = registry.findTool('skill_pending');

  invariant(pending);

  const proposals = [
    { at: firstAt, proposalID: 'a1lapsed00', name: 'star-chart' },
    { at: laterAt, proposalID: 'b2approved', name: 'moon-phase' },
    { at: laterAt, proposalID: 'c3rejected', name: 'wind-rose' },
    { at: laterAt, proposalID: 'd4waiting0', name: 'cloud-atlas' },
  ];

  for (const proposal of proposals) {
    setSystemTime(new Date(proposal.at));

    await writeRecords(ctx.log, [
      {
        kind: 'skills.write_proposed',
        definitions: { snapshotHash: 'snapshot-a' },
        thread: 'conversation',
        payload: skillsWriteProposedCodec.encode({
          proposalID: proposal.proposalID,
          name: proposal.name,
          skillHash: `hash-${proposal.name}`,
          baseHash: null,
          files: [{ path: 'SKILL.md', text: `# ${proposal.name}\n` }],
          untypedToken: null,
          provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
        }),
      },
    ]);
  }

  setSystemTime(new Date(now));

  const answers = {
    log: ctx.log,
    clock,
    definitions: () => ({ snapshotHash: 'snapshot-a' }),
    seedWrittenSkills: () => Promise.resolve(),
  };

  await writeSkillProposalLapses(answers);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_approved',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteApprovedCodec.encode({
        proposalID: 'b2approved',
        approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
        skillHash: 'hash-moon-phase',
        isEdited: false,
        approver: 'owner',
        channel: 'host',
      }),
    },
  ]);

  await writeSkillProposalAnswer(answers, {
    answer: 'reject',
    proposalID: 'c3rejected',
    skillHash: 'hash-wind-rose',
    reason: 'a weather skill already covers it',
  });

  const outcome = await pending.definition.run(
    { callID: 'call-2', tool: 'skill_pending', input: {}, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      proposals: [{ proposalID: 'd4waiting0', name: 'cloud-atlas', change: 'new', age: '5 days' }],
    },
  });
});
