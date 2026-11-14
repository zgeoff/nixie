import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { buildShortIDFromUUID } from '../build-short-id-from-uuid';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const proposalsMigration: Migration = {
  name: 'create the proposals',
  up: async (tx) => {
    await sql`create table if not exists proposals (
      proposal_id text primary key,
      short_id text not null,
      family text not null check (family in ('action', 'memory', 'skill', 'rule_change')),
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
      return_at integer
    ) strict`.execute(tx);

    await sql`create index if not exists proposals_by_state_and_lapse
      on proposals (state, lapses_at)`.execute(tx);

    await sql`create index if not exists proposals_by_state_and_return
      on proposals (state, return_at)`.execute(tx);

    await sql`create index if not exists proposals_by_short_id
      on proposals (short_id)`.execute(tx);

    await backfillProposals(tx);
  },
};

const recordKinds = [
  'policy.action_proposed',
  'policy.action_answered',
  'policy.action_lapsed',
  'memory.proposed',
  'memory.proposal_merged',
  'memory.approval_recorded',
  'memory.proposal_rejected',
  'memory.proposal_lapsed',
  'skills.write_proposed',
  'skills.write_approved',
  'skills.write_rejected',
  'skills.write_lapsed',
  'rules.change_proposed',
  'rules.change_approved',
  'rules.change_rejected',
  'rules.change_lapsed',
  'rules.change_withdrawn',
];

const recordSchema = z.object({
  sequence: z.number(),
  kind: z.string(),
  thread: z.string().nullable(),
  recorded_at: z.number(),
  payload: z.string(),
});

// The backfill folds the records that exist before this migration into the table, as the
// proposals projection folds each new one. A test holds the 2 to the same rows.
async function backfillProposals(tx: Transaction<unknown>): Promise<void> {
  const [existing] = await readQueryRows(
    sql`select count(*) as total from proposals`,
    tx,
    z.object({ total: z.number() }),
  );

  if ((existing?.total ?? 0) > 0) {
    return;
  }

  const rows = await readQueryRows(
    sql`select sequence, kind, thread, recorded_at, payload from records
      where kind in (${sql.join(recordKinds)}) order by sequence`,
    tx,
    recordSchema,
  );

  for (const row of rows) {
    const payload = z.record(z.string(), z.unknown()).parse(JSON.parse(row.payload));

    await foldRecord(tx, row, payload);
  }
}

type ProposalRecordRow = z.output<typeof recordSchema>;

type Payload = Readonly<Record<string, unknown>>;

const hourMs = 60 * 60 * 1000;
const internalLapseMs = 14 * 24 * hourMs;

async function foldRecord(
  tx: Transaction<unknown>,
  row: ProposalRecordRow,
  payload: Payload,
): Promise<void> {
  const named = z.string().safeParse(payload['proposalID']);

  if (!named.success) {
    return;
  }

  const proposalID = named.data;

  if (row.kind === 'policy.action_proposed') {
    await insertAction(tx, row, payload);
  } else if (row.kind === 'memory.proposed') {
    await insertMemory(tx, row, payload);
  } else if (row.kind === 'skills.write_proposed') {
    await insertProposal(tx, row, {
      id: proposalID,
      shortID: proposalID,
      family: 'skill',
      kind: 'internal_change',
      riskClass: 'routine',
      actionHash: z.string().parse(payload['skillHash']),
      ruleHash: null,
      cause: 'skill_write',
      taskID: null,
      lapsesAt: row.recorded_at + internalLapseMs,
      deadlineAt: null,
    });
  } else if (row.kind === 'rules.change_proposed') {
    const risk = z.literal('lifting').safeParse(payload['riskClass']);

    await insertProposal(tx, row, {
      id: proposalID,
      shortID: proposalID,
      family: 'rule_change',
      kind: 'internal_change',
      riskClass: risk.success ? 'lifting' : 'routine',
      actionHash: z.string().parse(payload['proposalHash']),
      ruleHash: null,
      cause: 'rule_widening',
      taskID: null,
      lapsesAt: row.recorded_at + internalLapseMs,
      deadlineAt: null,
    });
  } else {
    await foldClosing(tx, row.kind, proposalID, payload);
  }
}

const actionLapseMs = 72 * hourMs;
const riskSchema = z.enum(['routine', 'always_ask', 'lifting']);

async function insertAction(
  tx: Transaction<unknown>,
  row: ProposalRecordRow,
  payload: Payload,
): Promise<void> {
  const required = z
    .object({
      proposalID: z.string(),
      shortID: z.string(),
      actionHash: z.string(),
      cause: z.string(),
    })
    .parse(payload);

  const risk = riskSchema.safeParse(payload['riskClass']);
  const defaultRisk = required.cause === 'always_ask' ? 'always_ask' : 'routine';
  const rule = z.object({ hash: z.string() }).safeParse(payload['rule']);
  const taskID = z.string().safeParse(payload['taskID']);
  const lapsesAt = z.number().safeParse(payload['lapsesAt']);
  const deadlineAt = z.number().safeParse(payload['deadlineAt']);

  await insertProposal(tx, row, {
    id: required.proposalID,
    shortID: required.shortID,
    family: 'action',
    kind: 'action',
    riskClass: risk.success ? risk.data : defaultRisk,
    actionHash: required.actionHash,
    ruleHash: rule.success ? rule.data.hash : null,
    cause: required.cause,
    taskID: taskID.success ? taskID.data : null,
    lapsesAt: lapsesAt.success ? lapsesAt.data : row.recorded_at + actionLapseMs,
    deadlineAt: deadlineAt.success ? deadlineAt.data : null,
  });
}

interface NewProposalRow {
  readonly id: string;
  readonly shortID: string;
  readonly family: string;
  readonly kind: string;
  readonly riskClass: string;
  readonly actionHash: string;
  readonly ruleHash: string | null;
  readonly cause: string;
  readonly taskID: string | null;
  readonly lapsesAt: number;
  readonly deadlineAt: number | null;
}

async function insertProposal(
  tx: Transaction<unknown>,
  row: ProposalRecordRow,
  proposal: NewProposalRow,
): Promise<void> {
  await sql`insert or ignore into proposals (
      proposal_id, short_id, family, kind, risk_class, action_hash, rule_hash, cause, task_id,
      thread, created_sequence, created_at, lapses_at, deadline_at, state
    ) values (
      ${proposal.id}, ${proposal.shortID}, ${proposal.family}, ${proposal.kind},
      ${proposal.riskClass}, ${proposal.actionHash}, ${proposal.ruleHash}, ${proposal.cause},
      ${proposal.taskID}, ${row.thread}, ${row.sequence}, ${row.recorded_at}, ${proposal.lapsesAt},
      ${proposal.deadlineAt}, 'pending'
    )`.execute(tx);
}

async function insertMemory(
  tx: Transaction<unknown>,
  row: ProposalRecordRow,
  payload: Payload,
): Promise<void> {
  const parsed = z
    .object({
      proposalID: z.string(),
      reviewReason: z.string(),
      actionHash: z.string(),
      lapseAt: z.number(),
      taskID: z.string().nullable(),
    })
    .parse(payload);

  await insertProposal(tx, row, {
    id: parsed.proposalID,
    shortID: buildShortIDFromUUID(parsed.proposalID),
    family: 'memory',
    kind: 'memory_write',
    riskClass: 'routine',
    actionHash: parsed.actionHash,
    ruleHash: null,
    cause: parsed.reviewReason,
    taskID: parsed.taskID,
    lapsesAt: parsed.lapseAt,
    deadlineAt: null,
  });
}

const closingStates: Readonly<
  Record<string, 'approved' | 'declined' | 'lapsed' | 'withdrawn' | undefined>
> = {
  'policy.action_lapsed': 'lapsed',
  'memory.approval_recorded': 'approved',
  'memory.proposal_rejected': 'declined',
  'memory.proposal_lapsed': 'lapsed',
  'skills.write_approved': 'approved',
  'skills.write_rejected': 'declined',
  'skills.write_lapsed': 'lapsed',
  'rules.change_approved': 'approved',
  'rules.change_rejected': 'declined',
  'rules.change_lapsed': 'lapsed',
  'rules.change_withdrawn': 'withdrawn',
};

async function foldClosing(
  tx: Transaction<unknown>,
  kind: string,
  proposalID: string,
  payload: Payload,
): Promise<void> {
  if (kind === 'memory.proposal_merged') {
    const lapseAt = z.number().parse(payload['lapseAt']);

    await sql`update proposals set lapses_at = max(lapses_at, ${lapseAt})
      where proposal_id = ${proposalID}`.execute(tx);

    return;
  }

  const state =
    kind === 'policy.action_answered'
      ? z.enum(['approved', 'declined']).parse(payload['answer'])
      : closingStates[kind];

  if (state === undefined) {
    return;
  }

  const usedBy =
    kind === 'memory.approval_recorded' ? z.string().parse(payload['approvalID']) : null;

  await sql`update proposals set state = ${state}, used_by = ${usedBy}
    where proposal_id = ${proposalID} and state in ('pending', 'deferred')`.execute(tx);
}
