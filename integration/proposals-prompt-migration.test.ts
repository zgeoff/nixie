import { expect, test } from 'bun:test';
import { nixieSchema, readQueryRows } from '@heynixie/db';
import type { JSONValue } from '@heynixie/log';
import {
  logProjections,
  runProjectionRebuild,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import { mapPromptProposalRecord } from '@heynixie/prompts';
import { buildProposalsProjection, proposeInTransaction } from '@heynixie/proposals';
import { startTestProposals } from '@heynixie/proposals/test-utils';
import { mapSkillProposalRecord } from '@heynixie/skills';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';

type LegacyKind =
  | 'skills.write_proposed'
  | 'prompts.override_proposed'
  | 'prompts.override_approved'
  | 'prompts.override_rejected';

// A database at schema 94 holds the skill rows that the skill mapper folded, with no same-thing
// key, and no prompt row.
async function setupTest() {
  const base = await startTestProposals({
    mappers: [mapSkillProposalRecord],
    families: ['skill', 'prompt'],
  });

  const migration = nixieSchema.migrations.find(
    (candidate) =>
      candidate.name === 'add the prompt family and the same-thing key to the proposals',
  );

  invariant(migration);

  const definitions = { snapshotHash: 'snapshot-a' };

  const write = (kind: LegacyKind, thread: string, payload: Readonly<Record<string, JSONValue>>) =>
    writeRecords(base.log, [{ kind, definitions, thread, payload }]);

  const readRows = async () => {
    const rows = await sql`select * from proposals order by created_sequence`.execute(
      base.log.writer.db,
    );

    return rows.rows;
  };

  return {
    ...base,
    definitions,
    readRows,
    write,
    writeSkillProposal: (proposalID: string, name: string) =>
      write('skills.write_proposed', 'conversation', {
        proposalID,
        name,
        skillHash: `hash-${proposalID}`,
        baseHash: null,
        files: [],
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
    readUsedBy: async () => {
      const rows = await readQueryRows(
        sql`select used_by from proposals order by created_sequence`,
        base.log.writer.db,
        z.object({ used_by: z.string().nullable() }),
      );

      return rows.map((row) => row.used_by);
    },
    runMigration: () => withWriteTransaction(base.log.writer, (tx) => migration.up(tx)),
    rebuild: () =>
      runProjectionRebuild({
        ...base.log,
        projections: [
          ...logProjections,
          buildProposalsProjection([mapSkillProposalRecord, mapPromptProposalRecord]),
        ],
      }),
    forgetSameThing: () => sql`update proposals set same_thing = null`.execute(base.log.writer.db),
  };
}

test('it gives an upgraded database the same rows as a rebuild, down to the approval ID of a prompt', async () => {
  const ctx = await setupTest();

  await ctx.writeSkillProposal('skill-1', 'notes');
  await ctx.writePromptProposal('prompt-1', 'compaction', 'conversation');

  await ctx.write('prompts.override_approved', 'conversation', {
    proposalID: 'prompt-1',
    approvalID: 'approval-1',
    proposalHash: 'hash-prompt-1',
    isEdited: false,
    approver: 'owner',
    channel: 'host',
  });

  await ctx.writePromptProposal('prompt-2', 'session', 'conversation');
  await ctx.writePromptProposal('prompt-3', 'compaction', 'task-1');
  await ctx.write('prompts.override_rejected', 'task-1', { proposalID: 'prompt-3' });
  await ctx.forgetSameThing();
  await ctx.runMigration();

  const migrated = await ctx.readRows();

  await ctx.rebuild();

  const rebuilt = await ctx.readRows();

  expect(migrated).toStrictEqual(rebuilt);

  const usedBy = await ctx.readUsedBy();

  expect(usedBy).toStrictEqual([null, 'approval-1', null, null]);
});

test('it replaces a skill proposal that was open at the upgrade when the same change comes again', async () => {
  const ctx = await setupTest();

  await ctx.writeSkillProposal('skill-1', 'notes');
  await ctx.forgetSameThing();
  await ctx.runMigration();

  await withWriteTransaction(ctx.log.writer, (tx) =>
    proposeInTransaction(ctx.deps, tx, {
      family: 'skill',
      kind: 'internal_change',
      cause: 'skill_write',
      riskClass: 'routine',
      actionHash: 'hash-new',
      ruleHash: null,
      thread: 'conversation',
      taskID: null,
      deadlineAt: null,
      sameThing: 'notes',
    }),
  );

  const open = await sql`select proposal_id from proposals where state = 'pending'`.execute(
    ctx.log.writer.db,
  );

  expect(open.rows).toHaveLength(1);
});

test('it replaces a prompt proposal that was open at the upgrade when the same change comes again', async () => {
  const ctx = await setupTest();

  await ctx.writePromptProposal('prompt-1', 'compaction', 'conversation');
  await ctx.runMigration();

  await withWriteTransaction(ctx.log.writer, (tx) =>
    proposeInTransaction(ctx.deps, tx, {
      family: 'prompt',
      kind: 'internal_change',
      cause: 'prompt_override',
      riskClass: 'always_ask',
      actionHash: 'hash-new',
      ruleHash: null,
      thread: 'conversation',
      taskID: null,
      deadlineAt: null,
      sameThing: 'compaction',
    }),
  );

  const open = await sql`select proposal_id from proposals where state = 'pending'`.execute(
    ctx.log.writer.db,
  );

  expect(open.rows).toHaveLength(1);
});
