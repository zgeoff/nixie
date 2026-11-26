import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nixieSchema, readQueryRows } from '@heynixie/db';
import type { JSONValue, Log, Projection } from '@heynixie/log';
import {
  logProjections,
  runProjectionRebuild,
  startWriter,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import { mapPromptProposalRecord } from '@heynixie/prompts';
import { buildProposalsProjection, proposeInTransaction } from '@heynixie/proposals';
import { startTestProposals } from '@heynixie/proposals/test-utils';
import { mapSkillProposalRecord } from '@heynixie/skills';
import { createFakeClock } from '@zgeoff/testing/clock';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';

// A database at schema 94, written through the log, then upgraded by the normal start.
type LegacyKind =
  | 'skills.write_proposed'
  | 'skills.write_approved'
  | 'skills.write_rejected'
  | 'prompts.override_proposed'
  | 'prompts.override_approved'
  | 'prompts.override_rejected';

interface ProposeRequest {
  readonly family: 'skill' | 'prompt';
  readonly sameThing: string;
}

async function setupTest() {
  const migrationName = 'add the prompt family and the same-thing key to the proposals';
  const lapseMs = 14 * 24 * 60 * 60 * 1000;

  // The proposals projection as the release before folded skill records: no same-thing key, no
  // approval ID, and no prompt row.
  const legacySkillProjection: Projection = {
    table: 'proposals',
    keyColumn: 'proposal_id',
    fold: async (tx, record) => {
      const payload = record.payload;
      const proposalID = String(payload['proposalID']);

      if (record.kind === 'skills.write_proposed') {
        await sql`insert into proposals (
            proposal_id, short_id, family, kind, risk_class, action_hash, rule_hash, cause, task_id,
            thread, created_sequence, created_at, lapses_at, deadline_at, state
          ) values (
            ${proposalID}, ${proposalID}, 'skill', 'internal_change', 'routine',
            ${String(payload['skillHash'])}, null, 'skill_write', null, ${record.thread},
            ${record.sequence}, ${record.recordedAt.getTime()},
            ${record.recordedAt.getTime() + lapseMs}, null, 'pending'
          )`.execute(tx);

        return [proposalID];
      }

      const states: Readonly<Record<string, string | undefined>> = {
        'skills.write_approved': 'approved',
        'skills.write_rejected': 'declined',
        'skills.write_lapsed': 'lapsed',
      };

      const state = states[record.kind];

      if (state === undefined) {
        return [];
      }

      await sql`update proposals set state = ${state},
        answered_by = ${typeof payload['identityID'] === 'string' ? payload['identityID'] : null}
        where proposal_id = ${proposalID} and state = 'pending'`.execute(tx);

      return [proposalID];
    },
  };

  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-proposals-upgrade-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const migration = nixieSchema.migrations.find((candidate) => candidate.name === migrationName);

  invariant(migration);

  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });

  const before = await startWriter({
    dataDir,
    clock,
    schema: {
      ...nixieSchema,
      migrations: nixieSchema.migrations.slice(0, nixieSchema.migrations.indexOf(migration)),
    },
  });

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const oldLog: Log = {
    writer: before,
    deploymentKey,
    projections: [...logProjections, legacySkillProjection],
  };

  const definitions = { snapshotHash: 'snapshot-a' };

  const write = (kind: LegacyKind, thread: string, payload: Readonly<Record<string, JSONValue>>) =>
    writeRecords(oldLog, [{ kind, definitions, thread, payload }]);

  const mappers = [mapSkillProposalRecord, mapPromptProposalRecord];
  const projections = [...logProjections, buildProposalsProjection(mappers)];

  const upgrade = async () => {
    await before.stop();

    const writer = await startWriter({ dataDir, clock });

    stack.defer(() => writer.stop());

    return {
      writer,
      log: { writer, deploymentKey, projections } satisfies Log,
      readRows: () =>
        readQueryRows(
          sql`select * from proposals order by created_sequence`,
          writer.db,
          z.record(z.string(), z.json()),
        ),
    };
  };

  const proposals = await startTestProposals({
    mappers,
    families: ['skill', 'prompt'],
  });

  return {
    clock,
    write,
    upgrade,
    proposals,
    writeSkillProposal: (proposalID: string, name: string) =>
      write('skills.write_proposed', 'conversation', {
        proposalID,
        name,
        skillHash: `hash-${proposalID}`,
        baseHash: null,
        files: [{ path: 'SKILL.md', text: '# Notes\n' }],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      }),
    writePromptProposal: (proposalID: string, promptID: string, thread: string) =>
      write('prompts.override_proposed', thread, {
        proposalID,
        promptID,
        proposalHash: `hash-${proposalID}`,
        baseHash: null,
        entry: {},
        files: [],
        reason: 'Tighten it.',
        provenance: { runID: 'run-1', callID: 'call-2', profile: 'standard' },
      }),
    rebuild: (log: Log) => runProjectionRebuild(log),
    propose: (log: Log, input: ProposeRequest) =>
      withWriteTransaction(log.writer, (tx) =>
        proposeInTransaction({ ...proposals.deps, log, clock }, tx, {
          family: input.family,
          kind: 'internal_change',
          cause: input.family === 'skill' ? 'skill_write' : 'prompt_override',
          riskClass: input.family === 'skill' ? 'routine' : 'always_ask',
          actionHash: 'hash-new',
          ruleHash: null,
          thread: 'conversation',
          taskID: null,
          deadlineAt: null,
          sameThing: input.sameThing,
        }),
      ),
    readOpen: async (log: Log) => {
      const open = await sql`select family, same_thing from proposals
        where state = 'pending' order by created_sequence`.execute(log.writer.db);

      return open.rows;
    },
  };
}

test('it gives an upgraded database the same rows as a rebuild, in every column', async () => {
  const ctx = await setupTest();

  await ctx.writeSkillProposal('skill-1', 'notes');
  await ctx.writeSkillProposal('skill-2', 'rotas');
  await ctx.writePromptProposal('prompt-1', 'compaction', 'conversation');

  await ctx.write('skills.write_approved', 'conversation', {
    proposalID: 'skill-1',
    approvalID: 'skill-approval-1',
    skillHash: 'hash-skill-1',
    isEdited: false,
    approver: 'owner',
    identityID: 'owner',
    channel: 'host',
  });

  await ctx.write('skills.write_rejected', 'conversation', {
    proposalID: 'skill-2',
    identityID: 'owner',
  });

  await ctx.write('prompts.override_approved', 'conversation', {
    proposalID: 'prompt-1',
    approvalID: 'approval-1',
    proposalHash: 'hash-prompt-1',
    isEdited: false,
    approver: 'owner',
    channel: 'browser',
    identityID: 'identity-1',
  });

  await ctx.writePromptProposal('prompt-2', 'session', 'conversation');
  await ctx.writePromptProposal('prompt-3', 'compaction', 'task-1');
  await ctx.write('prompts.override_rejected', 'task-1', { proposalID: 'prompt-3' });

  const upgraded = await ctx.upgrade();
  const migrated = await upgraded.readRows();

  await ctx.rebuild(upgraded.log);

  const rebuilt = await upgraded.readRows();

  expect(migrated).toStrictEqual(rebuilt);

  expect(
    migrated.map((row) => [row['proposal_id'], row['state'], row['used_by'], row['answered_by']]),
  ).toStrictEqual([
    ['skill-1', 'approved', 'skill-approval-1', 'owner'],
    ['skill-2', 'declined', null, 'owner'],
    ['prompt-1', 'approved', 'approval-1', 'identity-1'],
    ['prompt-2', 'pending', null, null],
    ['prompt-3', 'declined', null, null],
  ]);
});

test('it replaces the skill and the prompt proposals that were open at the upgrade when the same changes come again', async () => {
  const ctx = await setupTest();

  await ctx.writeSkillProposal('skill-1', 'notes');
  await ctx.writePromptProposal('prompt-1', 'compaction', 'conversation');

  const upgraded = await ctx.upgrade();

  await ctx.propose(upgraded.log, { family: 'skill', sameThing: 'notes' });
  await ctx.propose(upgraded.log, { family: 'prompt', sameThing: 'compaction' });

  const open = await ctx.readOpen(upgraded.log);

  expect(open).toStrictEqual([
    { family: 'skill', same_thing: 'notes' },
    { family: 'prompt', same_thing: 'compaction' },
  ]);
});

test('it closes every open prompt override of one thing at the upgrade when the next one comes', async () => {
  const ctx = await setupTest();

  await ctx.writePromptProposal('prompt-1', 'compaction', 'conversation');
  await ctx.writePromptProposal('prompt-2', 'compaction', 'conversation');

  const upgraded = await ctx.upgrade();

  await ctx.propose(upgraded.log, { family: 'prompt', sameThing: 'compaction' });

  const open = await ctx.readOpen(upgraded.log);

  expect(open).toStrictEqual([{ family: 'prompt', same_thing: 'compaction' }]);
});
