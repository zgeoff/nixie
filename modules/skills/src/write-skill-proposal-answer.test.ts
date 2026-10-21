import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkSkillFiles,
  createPathSource,
  readDefinitionsInForce,
  readWrittenSkills,
  runSeed,
  runWrittenSkillSeed,
  writeWrittenSkill,
  writeWrittenSkillState,
} from '@heynixie/definitions';
import { readRecords, startWriter, withWriteTransaction, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { loadOrPinTaskSkills } from './load-or-pin-task-skills';
import { SkillProposalClosedError } from './skill-proposal-closed-error';
import { SkillProposalHashError } from './skill-proposal-hash-error';
import { SkillProposalNotFoundError } from './skill-proposal-not-found-error';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';
import { writeSkillProposalAnswer } from './write-skill-proposal-answer';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-answer-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(root);

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };
  const policy = { rules: [], tools: [] };

  return {
    log,
    root,
    source: createPathSource({ directory: root }),
    policy,
    context: {
      log,
      clock: buildTestClock(Date.now()),
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      seedWrittenSkills: async () => {
        await runWrittenSkillSeed({ log, policy });
      },
    },
  };
}

test('it records an approval that names you, with its ID and the version it put in force', async () => {
  const ctx = await setupTest();

  const files = [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ];

  const skill = checkSkillFiles('tide-tables', files);

  invariant('skillHash' in skill);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: skill.skillHash,
        baseHash: null,
        files,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const result = await writeSkillProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    skillHash: skill.skillHash,
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved'],
  });

  expect(result).toStrictEqual({
    proposalID: 'k3x9m2p7qa',
    approvalID: expect.toBeString(),
    skillHash: skill.skillHash,
  });

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'skills.write_approved',
      thread: 'conversation',
      payload: {
        proposalID: 'k3x9m2p7qa',
        approvalID: result.approvalID,
        skillHash: skill.skillHash,
        isEdited: false,
        approver: 'owner',
        channel: 'host',
      },
    },
  ]);
});

test('it puts an approved skill in force, so the next task loads it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

  const files = [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
    },
  ];

  const skill = checkSkillFiles('tide-tables', files);

  invariant('skillHash' in skill);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: skill.skillHash,
        baseHash: null,
        files,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writeSkillProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    skillHash: skill.skillHash,
  });

  const inForce = await readDefinitionsInForce(ctx.log.writer.db);

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-b',
    inForce,
    list: inForce?.conversationSkills ?? [],
  });

  expect(skills).toStrictEqual([
    {
      name: 'tide-tables',
      skillHash: skill.skillHash,
      frontmatter: skill.frontmatter,
      files: skill.files,
      origin: 'nixie',
    },
  ]);
});

test('it refuses a second approval over the same base as stale before the first one seeds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

  const byPort = [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ];

  const byHour = [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy hour.\n',
    },
  ];

  const first = checkSkillFiles('tide-tables', byPort);
  const second = checkSkillFiles('tide-tables', byHour);

  invariant('skillHash' in first);
  invariant('skillHash' in second);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: first.skillHash,
        baseHash: null,
        files: byPort,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'w7tn4c9rhz',
        name: 'tide-tables',
        skillHash: second.skillHash,
        baseHash: null,
        files: byHour,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const unseeded = { ...ctx.context, seedWrittenSkills: () => Promise.resolve() };

  await writeSkillProposalAnswer(unseeded, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    skillHash: first.skillHash,
  });

  const refusal = await writeSkillProposalAnswer(unseeded, {
    answer: 'approve',
    proposalID: 'w7tn4c9rhz',
    skillHash: second.skillHash,
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toMatchObject({ code: 'STALE_BASE' });
});

test("it refuses an approval over a retired version as stale before the retirement's seed runs", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text);
  await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

  const byPort = [{ path: 'SKILL.md', text: `${text}By port.\n` }];
  const byHour = [{ path: 'SKILL.md', text: `${text}By hour.\n` }];
  const retired = checkSkillFiles('tide-tables', byPort);
  const proposed = checkSkillFiles('tide-tables', byHour);

  invariant('skillHash' in retired);
  invariant('skillHash' in proposed);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3x9m2p7qa',
      skill: retired,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy: ctx.policy });

  await withWriteTransaction(ctx.log.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    }),
  );

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'w7tn4c9rhz',
        name: 'tide-tables',
        skillHash: proposed.skillHash,
        baseHash: retired.skillHash,
        files: byHour,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writeSkillProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'w7tn4c9rhz',
    skillHash: proposed.skillHash,
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toMatchObject({ code: 'STALE_BASE' });
});

test('it applies your edited files and marks the approval edited', async () => {
  const ctx = await setupTest();

  const files = [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ];

  const edited = [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ];

  const skill = checkSkillFiles('tide-tables', files);
  const editedSkill = checkSkillFiles('tide-tables', edited);

  invariant('skillHash' in skill);
  invariant('skillHash' in editedSkill);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: skill.skillHash,
        baseHash: null,
        files,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  await writeSkillProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    skillHash: skill.skillHash,
    files: edited,
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved'],
  });

  const written = await readWrittenSkills(ctx.log.writer.db);

  expect(records.map((entry) => entry.record.payload)).toMatchObject([
    { skillHash: editedSkill.skillHash, isEdited: true },
  ]);

  expect(written.map((entry) => entry.skillHash)).toStrictEqual([editedSkill.skillHash]);
});

test('it refuses edited files that fail the seed checks, and records nothing', async () => {
  const ctx = await setupTest();

  const files = [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ];

  const skill = checkSkillFiles('tide-tables', files);

  invariant('skillHash' in skill);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: skill.skillHash,
        baseHash: null,
        files,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await writeSkillProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    skillHash: skill.skillHash,
    files: [{ path: 'SKILL.md', text: '# Tides, with no frontmatter\n' }],
  }).then(
    () => null,
    (error: unknown) => error,
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved'],
  });

  const written = await readWrittenSkills(ctx.log.writer.db);

  expect(refusal).toMatchObject({ name: 'SkillProposalCheckError', code: 'SKILL_CHECK' });
  expect(records).toStrictEqual([]);
  expect(written).toStrictEqual([]);
});

test('it records a rejection with your reason in its erasable fields', async () => {
  const ctx = await setupTest();

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

  await writeSkillProposalAnswer(ctx.context, {
    answer: 'reject',
    proposalID: 'k3x9m2p7qa',
    skillHash: 'hash-b',
    reason: 'the harbour tables come from a feed',
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_rejected'],
  });

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'skills.write_rejected',
      thread: 'conversation',
      payload: { proposalID: 'k3x9m2p7qa' },
      erasable: {
        status: 'readable',
        fields: { reason: 'the harbour tables come from a feed' },
      },
    },
  ]);
});

test('it closes a proposal once when an approval and a rejection arrive together', async () => {
  const ctx = await setupTest();

  const files = [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ];

  const skill = checkSkillFiles('tide-tables', files);

  invariant('skillHash' in skill);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'k3x9m2p7qa',
        name: 'tide-tables',
        skillHash: skill.skillHash,
        baseHash: null,
        files,
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    },
  ]);

  const settled = await Promise.allSettled([
    writeSkillProposalAnswer(ctx.context, {
      answer: 'approve',
      proposalID: 'k3x9m2p7qa',
      skillHash: skill.skillHash,
    }),
    writeSkillProposalAnswer(ctx.context, {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      skillHash: skill.skillHash,
      reason: 'not now',
    }),
  ]);

  const closing = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved', 'skills.write_rejected'],
  });

  expect(settled.map((result) => result.status)).toIncludeSameMembers(['fulfilled', 'rejected']);

  expect(settled.filter((result) => result.status === 'rejected')).toMatchObject([
    { reason: { code: 'PROPOSAL_CLOSED' } },
  ]);

  expect(closing).toHaveLength(1);
});

test('it refuses an answer to a proposal no record holds', async () => {
  const ctx = await setupTest();

  const refusal = await writeSkillProposalAnswer(ctx.context, {
    answer: 'reject',
    proposalID: 'k3x9m2p7qa',
    skillHash: 'hash-b',
    reason: 'not now',
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(SkillProposalNotFoundError);
});

test('it refuses a second answer to a proposal an answer closed', async () => {
  const ctx = await setupTest();

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
  ]);

  const refusal = await writeSkillProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    skillHash: 'hash-b',
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(SkillProposalClosedError);
  expect(refusal).toMatchObject({ code: 'PROPOSAL_CLOSED', outcome: 'rejected' });
});

test('it refuses an answer to a proposal whose lapse time has come', async () => {
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
  ]);

  const refusal = await writeSkillProposalAnswer(
    { ...ctx.context, clock: buildTestClock(proposedAt + 14 * 24 * 60 * 60 * 1000) },
    {
      answer: 'reject',
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
      reason: 'not now',
    },
  ).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(SkillProposalClosedError);
  expect(refusal).toMatchObject({ code: 'PROPOSAL_CLOSED', outcome: 'lapsed' });
});

test('it refuses an answer that names another skill hash, and records nothing', async () => {
  const ctx = await setupTest();

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

  const refusal = await writeSkillProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'k3x9m2p7qa',
    skillHash: 'hash-a',
  }).then(
    () => null,
    (error: unknown) => error,
  );

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved'],
  });

  expect(refusal).toBeInstanceOf(SkillProposalHashError);
  expect(records).toStrictEqual([]);
});

test.each([
  ['an approval', { answer: 'approve' }],
  ['a rejection', { answer: 'reject', reason: 'not now' }],
] as const)(
  'it refuses %s of a proposal whose base version changed as stale, and records nothing',
  async (_, answer) => {
    const ctx = await setupTest();

    await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
    await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
    await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

    await writeFile(
      join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
      '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
    );

    const seeded = await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

    const base = seeded.inForce?.skills[0];

    invariant(base);

    await writeRecords(ctx.log, [
      {
        kind: 'skills.write_proposed',
        definitions: { snapshotHash: 'snapshot-a' },
        thread: 'conversation',
        payload: skillsWriteProposedCodec.encode({
          proposalID: 'k3x9m2p7qa',
          name: 'tide-tables',
          skillHash: 'hash-b',
          baseHash: base.skillHash,
          files: [{ path: 'SKILL.md', text: '# Tides by port\n' }],
          untypedToken: null,
          provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
        }),
      },
    ]);

    await writeFile(
      join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
      '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by hour\n',
    );

    await runSeed({ log: ctx.log, source: ctx.source, policy: ctx.policy });

    const refusal = await writeSkillProposalAnswer(ctx.context, {
      ...answer,
      proposalID: 'k3x9m2p7qa',
      skillHash: 'hash-b',
    }).then(
      () => null,
      (error: unknown) => error,
    );

    const records = await readRecords(ctx.log, {
      afterSequence: 0,
      kinds: ['skills.write_approved', 'skills.write_rejected'],
    });

    expect(refusal).toMatchObject({ name: 'SkillProposalStaleError', code: 'STALE_BASE' });
    expect(records).toStrictEqual([]);
  },
);
