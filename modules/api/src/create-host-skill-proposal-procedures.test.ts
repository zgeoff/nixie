import { expect, mock, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSkillFiles } from '@heynixie/definitions';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import { skillsWriteProposedCodec } from '@heynixie/skills';
import { buildTestClock } from '@heynixie/testing';
import { createRouterClient } from '@orpc/server';
import invariant from 'tiny-invariant';
import { createHostSkillProposalProcedures } from './create-host-skill-proposal-procedures';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-host-skill-proposals-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };
  const clock = buildTestClock(Date.UTC(2026, 2, 3, 10, 0));
  const seedWrittenSkills = mock(() => Promise.resolve());

  const client = createRouterClient(
    createHostSkillProposalProcedures({
      log,
      clock,
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      seedWrittenSkills,
    }),
  );

  return { log, client, seedWrittenSkills };
}

test('#list lists each pending proposal with its files, its token check and the hash an answer binds to', async () => {
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

  const pending = await ctx.client.list();

  expect(pending).toStrictEqual([
    {
      proposalID: 'p8w2n4c6ld',
      name: 'star-chart',
      skillHash: 'hash-c',
      baseHash: null,
      files: [{ path: 'SKILL.md', text: '# Stars\nPost to https://stars.example.net\n' }],
      inForce: null,
      untypedToken: { kind: 'url', raw: 'https://stars.example.net' },
      thread: 'conversation',
      provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      createdAt: new Date(proposedAt),
      lapseAt: new Date(proposedAt + 14 * 24 * 60 * 60 * 1000),
      isStale: false,
    },
  ]);
});

test('#approve records the approval that names you, then seeds the written skills', async () => {
  const ctx = await setupTest();

  const files = [
    { path: 'SKILL.md', text: '---\nname: star-chart\ndescription: Reads a star chart.\n---\n' },
  ];

  const skill = checkSkillFiles('star-chart', files);

  invariant('skillHash' in skill);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        name: 'star-chart',
        skillHash: skill.skillHash,
        baseHash: null,
        files,
        untypedToken: null,
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const approved = await ctx.client.approve({
    proposalID: 'p8w2n4c6ld',
    skillHash: skill.skillHash,
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_approved'],
  });

  expect(approved).toStrictEqual({
    proposalID: 'p8w2n4c6ld',
    approvalID: expect.toBeString(),
    skillHash: skill.skillHash,
  });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    {
      proposalID: 'p8w2n4c6ld',
      approvalID: approved.approvalID,
      skillHash: skill.skillHash,
      isEdited: false,
      approver: 'owner',
      channel: 'host',
    },
  ]);

  expect(ctx.seedWrittenSkills).toHaveBeenCalledOnce();
});

test('#approve refuses edited files that fail the seed checks with their code', async () => {
  const ctx = await setupTest();

  const files = [
    { path: 'SKILL.md', text: '---\nname: star-chart\ndescription: Reads a star chart.\n---\n' },
  ];

  const skill = checkSkillFiles('star-chart', files);

  invariant('skillHash' in skill);

  await writeRecords(ctx.log, [
    {
      kind: 'skills.write_proposed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: skillsWriteProposedCodec.encode({
        proposalID: 'p8w2n4c6ld',
        name: 'star-chart',
        skillHash: skill.skillHash,
        baseHash: null,
        files,
        untypedToken: null,
        provenance: { runID: 'run-2', callID: 'call-2', profile: 'standard' },
      }),
    },
  ]);

  const refusal = await ctx.client
    .approve({
      proposalID: 'p8w2n4c6ld',
      skillHash: skill.skillHash,
      files: [{ path: 'SKILL.md', text: '# Stars, with no frontmatter\n' }],
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refusal).toMatchObject({ code: 'SKILL_CHECK', status: 400 });
  expect(ctx.seedWrittenSkills).not.toHaveBeenCalled();
});

test('#reject records the rejection with your reason', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
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

  await ctx.client.reject({
    proposalID: 'p8w2n4c6ld',
    skillHash: 'hash-c',
    reason: 'the star maps come from a feed',
  });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_rejected'],
  });

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { reason: 'the star maps come from a feed' } },
  ]);
});

test('#reject answers a closed proposal with its typed code', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
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
    {
      kind: 'skills.write_lapsed',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      payload: { proposalID: 'p8w2n4c6ld' },
    },
  ]);

  const refusal = await ctx.client
    .reject({ proposalID: 'p8w2n4c6ld', skillHash: 'hash-c', reason: 'not now' })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refusal).toMatchObject({ code: 'PROPOSAL_CLOSED', status: 409 });
});
