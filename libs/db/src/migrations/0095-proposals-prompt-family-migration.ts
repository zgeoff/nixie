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

    await backfillSkillRows(tx);
    await backfillPromptProposals(tx);
    await dropMemoryProposalState(tx);
    await renameSuggestedRuleTables(tx);
  },
};

// A skill proposal replaces the open one of the same skill from the same thread, so the rows that
// exist before this migration take the skill's name as their key, as the proposals projection does.
// An approved row takes the ID of its approval as well.
async function backfillSkillRows(tx: Transaction<unknown>): Promise<void> {
  await sql`update proposals set same_thing = (
      select json_extract(records.payload, '$.name') from records
      where records.kind = 'skills.write_proposed' and records.sequence = proposals.created_sequence
    ) where family = 'skill' and same_thing is null`.execute(tx);

  // The approval record of a skill names the approval that the row's used_by holds.
  await sql`update proposals set used_by = (
      select json_extract(records.payload, '$.approvalID') from records
      where records.kind = 'skills.write_approved'
        and json_extract(records.payload, '$.proposalID') = proposals.proposal_id
    ) where family = 'skill' and state = 'approved' and used_by is null`.execute(tx);
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

const memoryProposalColumns = `proposal_id, item_id, is_new_item, operation, target_version,
  is_pinned, review_reason, action_hash, sealed, evidence, origin, source, task_id, thread,
  cap_group, checks, model, notice_key, created_sequence, created_at, resolved_sequence, kind,
  subject, new_subject, sealed_labels, target_revision, is_label_only`;

// The shared row holds a memory proposal's state and its lapse, so the memory table keeps neither.
// SQLite cannot drop a column that a check names, so the table is built again.
async function dropMemoryProposalState(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_proposals_next (
    proposal_id text primary key,
    item_id text not null,
    is_new_item integer not null check (is_new_item in (0, 1)),
    operation text not null check (operation in ('remember', 'retire', 'pin')),
    target_version integer check (target_version is null or target_version >= 1),
    is_pinned integer not null check (is_pinned in (0, 1)),
    review_reason text not null,
    action_hash text not null,
    sealed text not null,
    evidence text check (evidence is null or json_valid(evidence)),
    origin text not null check (origin in ('owner', 'conversation', 'task', 'memory_writer')),
    source text not null check (source in ('owner', 'owner_data', 'untrusted')),
    task_id text,
    thread text,
    cap_group text not null,
    checks text check (checks is null or json_valid(checks)),
    model text,
    notice_key text,
    created_sequence integer not null references records (sequence),
    created_at integer not null,
    resolved_sequence integer references records (sequence),
    kind text not null default 'fact',
    subject text,
    new_subject text,
    sealed_labels text,
    target_revision integer,
    is_label_only integer not null default 0
  ) strict`.execute(tx);

  await sql`insert into memory_proposals_next (${sql.raw(memoryProposalColumns)})
    select ${sql.raw(memoryProposalColumns)} from memory_proposals`.execute(tx);

  await sql`drop table memory_proposals`.execute(tx);
  await sql`alter table memory_proposals_next rename to memory_proposals`.execute(tx);
  await sql`create index memory_proposals_by_cap_group on memory_proposals (cap_group)`.execute(tx);
}

// The tables of the rules that nixie suggests held the name of the check that fed them. Their
// projection rows move with them, so a rebuild and an upgrade agree.
async function renameSuggestedRuleTables(tx: Transaction<unknown>): Promise<void> {
  const old =
    await sql`select 1 from sqlite_master where type = 'table' and name = 'gap_groups'`.execute(tx);

  if (old.rows.length === 0) {
    return;
  }

  await sql`alter table gap_answers rename to suggested_rule_answers`.execute(tx);
  await sql`alter table gap_groups rename to suggested_rule_groups`.execute(tx);
  await sql`drop index if exists gap_answers_by_group`.execute(tx);
  await sql`drop index if exists gap_groups_by_proposal`.execute(tx);

  await sql`create index if not exists suggested_rule_answers_by_group
    on suggested_rule_answers (group_hash, answered_at)`.execute(tx);

  await sql`create index if not exists suggested_rule_groups_by_proposal
    on suggested_rule_groups (proposal_id)`.execute(tx);

  await sql`update projection_changes set projection = 'suggested_rule_answers'
    where projection = 'gap_answers'`.execute(tx);

  await sql`update projection_changes set projection = 'suggested_rule_groups'
    where projection = 'gap_groups'`.execute(tx);
}
