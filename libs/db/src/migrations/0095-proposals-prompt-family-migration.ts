import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const proposalsPromptFamilyMigration: Migration = {
  name: 'add the prompt family and the same-thing key to the proposals',
  up: async (tx) => {
    // SQLite cannot change a check, so the table is rebuilt with the wider family list.
    await sql`create table proposals_next (
      proposal_id text primary key,
      short_id text not null,
      family text not null check (
        family in ('action', 'memory', 'skill', 'rule_change', 'mcp', 'prompt')
      ),
      kind text not null check (kind in ('action', 'memory_write', 'internal_change')),
      risk_class text not null check (risk_class in ('routine', 'always_ask', 'lifting')),
      action_hash text not null,
      rule_hash text,
      cause text not null,
      task_id text,
      thread text,
      created_sequence integer not null,
      created_at integer not null,
      lapses_at integer not null,
      deadline_at integer,
      state text not null check (
        state in ('pending', 'deferred', 'approved', 'declined', 'lapsed', 'withdrawn')
      ),
      used_by text,
      defer_generation integer not null default 0,
      defer_until integer,
      return_at integer,
      answered_by text,
      same_thing text
    ) strict`.execute(tx);

    await sql`insert into proposals_next (
      proposal_id, short_id, family, kind, risk_class, action_hash, rule_hash, cause, task_id,
      thread, created_sequence, created_at, lapses_at, deadline_at, state, used_by,
      defer_generation, defer_until, return_at, answered_by
    ) select
      proposal_id, short_id, family, kind, risk_class, action_hash, rule_hash, cause, task_id,
      thread, created_sequence, created_at, lapses_at, deadline_at, state, used_by,
      defer_generation, defer_until, return_at, answered_by
    from proposals`.execute(tx);

    await sql`drop table proposals`.execute(tx);
    await sql`alter table proposals_next rename to proposals`.execute(tx);

    await sql`create index if not exists proposals_by_state_and_lapse
      on proposals (state, lapses_at)`.execute(tx);

    await sql`create index if not exists proposals_by_state_and_return
      on proposals (state, return_at)`.execute(tx);

    await sql`create index if not exists proposals_by_short_id
      on proposals (short_id)`.execute(tx);

    await sql`create index if not exists proposals_by_same_thing
      on proposals (family, thread, same_thing) where same_thing is not null`.execute(tx);

    await backfillSkillSameThing(tx);
    await backfillPromptProposals(tx);
  },
};

// A skill proposal replaces the open one of the same skill from the same thread, so the rows that
// exist before this migration take the skill's name as their key, as the proposals projection does.
async function backfillSkillSameThing(tx: Transaction<unknown>): Promise<void> {
  await sql`update proposals set same_thing = (
      select json_extract(records.payload, '$.name') from records
      where records.kind = 'skills.write_proposed' and records.sequence = proposals.created_sequence
    ) where family = 'skill' and same_thing is null`.execute(tx);
}

const recordSchema = z.object({
  sequence: z.number(),
  kind: z.string(),
  thread: z.string().nullable(),
  recorded_at: z.number(),
  payload: z.string(),
});

const proposedSchema = z.object({
  proposalID: z.string(),
  promptID: z.string(),
  proposalHash: z.string(),
});

const approvedSchema = z.object({
  proposalID: z.string(),
  approvalID: z.string(),
  identityID: z.string().optional(),
});

const closingStates: Readonly<Record<string, string | undefined>> = {
  'prompts.override_approved': 'approved',
  'prompts.override_rejected': 'declined',
  'prompts.override_lapsed': 'lapsed',
};

const lapseMs = 14 * 24 * 60 * 60 * 1000;

// The backfill folds the prompt overrides that exist before this migration into the table, as the
// proposals projection folds each old record. A test holds the 2 to the same rows.
async function backfillPromptProposals(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select sequence, kind, thread, recorded_at, payload from records
      where kind in (
        'prompts.override_proposed', 'prompts.override_approved',
        'prompts.override_rejected', 'prompts.override_lapsed'
      ) order by sequence`,
    tx,
    recordSchema,
  );

  for (const row of rows) {
    const payload: unknown = JSON.parse(row.payload);

    if (row.kind === 'prompts.override_proposed') {
      const proposed = proposedSchema.parse(payload);

      await sql`insert or ignore into proposals (
          proposal_id, short_id, family, kind, risk_class, action_hash, rule_hash, cause, task_id,
          thread, created_sequence, created_at, lapses_at, deadline_at, state, same_thing
        ) values (
          ${proposed.proposalID}, ${proposed.proposalID}, 'prompt', 'internal_change',
          'always_ask', ${proposed.proposalHash}, null, 'prompt_override', null, ${row.thread},
          ${row.sequence}, ${row.recorded_at}, ${row.recorded_at + lapseMs}, null, 'pending',
          ${proposed.promptID}
        )`.execute(tx);

      continue;
    }

    const state = closingStates[row.kind];

    if (row.kind === 'prompts.override_approved') {
      const approved = approvedSchema.parse(payload);

      await sql`update proposals set state = ${state}, used_by = ${approved.approvalID},
        answered_by = ${approved.identityID ?? null}, defer_until = null, return_at = null
        where proposal_id = ${approved.proposalID} and state in ('pending', 'deferred')`.execute(
        tx,
      );

      continue;
    }

    const proposalID = z.object({ proposalID: z.string() }).parse(payload).proposalID;

    await sql`update proposals set state = ${state}, defer_until = null, return_at = null
      where proposal_id = ${proposalID} and state in ('pending', 'deferred')`.execute(tx);
  }
}
