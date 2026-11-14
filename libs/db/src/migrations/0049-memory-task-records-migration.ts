import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTriggersDropped } from '../database/with-triggers-dropped';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

// The keys of the deleted records stay in the key store, which a migration cannot reach. The sandbox
// records stay, because only a recovery that reads them can destroy their VMs. The oldest reader
// rises, because a release before this would run the note-taker catch-up again.
export const memoryTaskRecordsMigration: Migration = {
  name: "rewrite the built-in memory tasks' records as the conversation's",
  up: async (tx) => {
    await withTriggersDropped(tx, async () => {
      const facts = await readFacts(tx);
      const candidates = await readCandidates(tx);

      const plan = collectRecordPlan(candidates, facts);

      await requireNoOutsideMessages(tx);

      const removed = [...plan.removed, ...(await readForgetRecords(tx, plan.removed))];

      await requireNoOrphans(tx, new Set(removed));
      await writeMovedRecords(tx, plan.moved);
      await removeRecords(tx, removed);
      await removeTaskRows(tx);
      await rewriteProjectionRows(tx);
      await rewriteProjectionChanges(tx);
      await removeStoredPrompts(tx);

      if (removed.length > 0 || plan.moved.length > 0) {
        await rebuildThreads(tx);
      }
    });
  },
};

const consolidatorTaskID = 'memory-consolidator';
const taskIDs = ['memory-writer', consolidatorTaskID];
const retiredPromptIDs = ['writer', 'consolidator'];

interface Facts {
  readonly promptProposalIDs: ReadonlySet<string>;
  readonly removedInputIDs: ReadonlySet<string>;
}

async function readFacts(tx: Transaction<unknown>): Promise<Facts> {
  const proposals = await readQueryRows(
    sql`select json_extract(payload, '$.proposalID') as proposal_id from records
      where kind = 'prompts.override_proposed'
        and json_extract(payload, '$.promptID') in (${sql.join(retiredPromptIDs)})`,
    tx,
    z.object({ proposal_id: z.string() }),
  );

  const inputs = await readQueryRows(
    sql`select input_id from turn_inputs where task_id in (${sql.join(taskIDs)})`,
    tx,
    z.object({ input_id: z.string() }),
  );

  return {
    promptProposalIDs: new Set(proposals.map((row) => row.proposal_id)),
    removedInputIDs: new Set(inputs.map((row) => row.input_id)),
  };
}

// The kinds that only the 2 tasks write.
const ownKinds = [
  'memory.writer_started',
  'memory.batch_planned',
  'memory.batch_published',
  'memory.writer_failed',
  'memory.self_note_flagged',
  'memory.consolidation_proposed',
  'memory.consolidation_summarized',
  'memory.consolidation_commented',
  'memory.consolidation_approved',
  'memory.consolidation_rejected',
  'memory.consolidation_lapsed',
];

const promptKinds = [
  'prompts.override_proposed',
  'prompts.override_approved',
  'prompts.override_rejected',
  'prompts.override_lapsed',
  'prompts.override_exported',
];

const candidateSchema = z.object({
  sequence: z.number(),
  kind: z.string(),
  thread: z.string().nullable(),
  step_key: z.string().nullable(),
  proposal_id: z.string().nullable(),
  approval_id: z.string().nullable(),
  action_hash: z.string().nullable(),
  payload: z.string(),
});

type Candidate = z.output<typeof candidateSchema>;

// Every record that can name a task, a batch or a thread of the 2 tasks.
function readCandidates(tx: Transaction<unknown>): Promise<Candidate[]> {
  const kinds = [
    ...ownKinds,
    ...promptKinds,
    'task_message',
    'memory.notice',
    'model.input_opened',
  ];

  return readQueryRows(
    sql`select sequence, kind, thread, step_key, proposal_id, approval_id, action_hash, payload
      from records
      where thread in (${sql.join(taskIDs)})
        or kind in (${sql.join(kinds)})
        or payload like ${'%memory_writer%'}
        or payload like ${'%memory-writer%'}
        or payload like ${'%memory-consolidator%'}
        or payload like ${'%batch/%'}
        or step_key like ${'memory-writer:%'}
        or step_key like ${'memory-consolidator:%'}
      order by sequence`,
    tx,
    candidateSchema,
  );
}

interface MovedRecord {
  readonly sequence: number;
  readonly thread: string | null;
  readonly stepKey: string | null;
  readonly proposalID: string | null;
  readonly approvalID: string | null;
  readonly actionHash: string | null;
  readonly payload: string;
}

// A parse with named keys moves them ahead of the others, which would reorder a canonical form. Each
// value is parsed as a plain record instead, and only the keys this migration changes are replaced.
const recordSchema = z.record(z.string(), z.unknown());

function collectRecordPlan(
  candidates: readonly Candidate[],
  facts: Facts,
): { removed: number[]; moved: MovedRecord[] } {
  const removed: number[] = [];
  const moved: MovedRecord[] = [];

  for (const candidate of candidates) {
    if (candidate.kind.startsWith('sandbox.')) {
      continue;
    }

    const payload = recordSchema.safeParse(JSON.parse(candidate.payload)).data ?? {};

    if (isRemoved(candidate, payload, facts)) {
      removed.push(candidate.sequence);
      continue;
    }

    const move = buildMovedRecord(candidate, payload);

    if (move !== null) {
      moved.push(move);
    }
  }

  return { removed, moved };
}

// The kinds that the conversation writes too. Those of the 2 tasks become the conversation's.
const movedKinds = new Set([
  'memory.version_added',
  'memory.proposed',
  'memory.proposal_merged',
  'memory.approval_recorded',
  'memory.proposal_rejected',
  'memory.proposal_lapsed',
  'memory.pinned',
  'memory.sensitive_marked',
  'memory.self_noted',
  'memory.shared_noted',
  'memory.subject_changed',
  'memory.proposal_self_noted',
  'memory.proposal_shared_noted',
  'memory.proposal_sensitive_noted',
  'memory.proposal_subject_changed',
]);

function isRemoved(
  record: Candidate,
  payload: Readonly<Record<string, unknown>>,
  facts: Facts,
): boolean {
  const isMoved = movedKinds.has(record.kind);
  const isOnTaskThread = record.thread !== null && taskIDs.includes(record.thread);

  return (
    ownKinds.includes(record.kind) ||
    (record.kind === 'memory.notice' &&
      ['batch', 'catch_up'].includes(String(payload['notice']))) ||
    (record.kind === 'task_message' &&
      (taskIDs.includes(String(payload['from'])) || taskIDs.includes(String(payload['to'])))) ||
    (promptKinds.includes(record.kind) &&
      facts.promptProposalIDs.has(String(payload['proposalID']))) ||
    (record.kind === 'model.input_opened' &&
      facts.removedInputIDs.has(String(payload['inputID']))) ||
    (!isMoved && isOnTaskThread) ||
    (!isMoved && isTaskNamed(payload))
  );
}

function isTaskNamed(value: unknown): boolean {
  if (typeof value === 'string') {
    return taskIDs.includes(value);
  }

  return typeof value === 'object' && value !== null
    ? Object.values(value).some((item) => isTaskNamed(item))
    : false;
}

const conversation = 'conversation';

function buildMovedRecord(
  record: Candidate,
  payload: Readonly<Record<string, unknown>>,
): MovedRecord | null {
  if (!movedKinds.has(record.kind)) {
    return null;
  }

  const isChange =
    record.kind === 'memory.version_added' && payload['taskID'] === consolidatorTaskID;

  const rewritten = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, toMovedValue(key, value, isChange)]),
  );

  const next: MovedRecord = {
    sequence: record.sequence,
    thread:
      record.thread !== null && taskIDs.includes(record.thread) ? conversation : record.thread,
    stepKey: isTaskStepKey(record.step_key) ? null : record.step_key,
    proposalID: isChange ? null : record.proposal_id,
    approvalID: isChange ? null : record.approval_id,
    actionHash: isChange ? null : record.action_hash,
    payload: JSON.stringify(rewritten),
  };

  const isUnchanged =
    next.thread === record.thread &&
    next.stepKey === record.step_key &&
    next.proposalID === record.proposal_id &&
    next.approvalID === record.approval_id &&
    next.actionHash === record.action_hash &&
    next.payload === record.payload;

  return isUnchanged ? null : next;
}

// A key of a record or of a projection row. A consolidation change's version also loses the change
// it named as its proposal.
function toMovedValue(key: string, value: unknown, isChange: boolean): unknown {
  if (isChange && (key === 'proposalID' || key === 'proposal_id')) {
    return null;
  }

  if (isChange && key === 'origin') {
    return conversation;
  }

  return toConversationValue(key, value);
}

function toConversationValue(key: string, value: unknown): unknown {
  if (key === 'origin' && value === 'memory_writer') {
    return conversation;
  }

  if (['taskID', 'task_id', 'thread'].includes(key) && taskIDs.includes(String(value))) {
    return conversation;
  }

  return ['capGroup', 'noticeKey', 'cap_group', 'notice_key'].includes(key)
    ? toConversationKey(value)
    : value;
}

const batchKey = /^batch\/\d+-(?<end>\d+)$/u;

function toConversationKey(key: unknown): unknown {
  const end = typeof key === 'string' ? batchKey.exec(key)?.groups?.['end'] : undefined;

  return end === undefined ? key : `turn/${conversation}/${end}`;
}

function isTaskStepKey(stepKey: string | null): boolean {
  return taskIDs.some((taskID) => stepKey?.startsWith(`${taskID}:`) === true);
}

// A message from a task to another task sits in the other task's inbox, which a delete would leave
// half moved, so the migration stops and leaves the data as it was.
async function requireNoOutsideMessages(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select sequence from records
      where kind = 'task_message'
        and json_extract(payload, '$.from') in (${sql.join(taskIDs)})
        and json_extract(payload, '$.to') not in (${sql.join(taskIDs)})
      limit 1`,
    tx,
    z.object({ sequence: z.number() }),
  );

  const [outside] = rows;

  if (outside !== undefined) {
    throw new Error(
      `record ${String(outside.sequence)} is a message from a built-in memory task to another task, which the memory task migration cannot remove`,
    );
  }
}

// A forget of a removed record means nothing once the record is gone.
async function readForgetRecords(
  tx: Transaction<unknown>,
  removed: readonly number[],
): Promise<number[]> {
  const found: number[] = [];

  for (const chunk of toChunks(removed)) {
    const rows = await readQueryRows(
      sql`select sequence from records
        where kind in ('record.forget_started', 'record.forgotten')
          and json_extract(payload, '$.recordSequence') in (${sql.join(chunk)})`,
      tx,
      z.object({ sequence: z.number() }),
    );

    found.push(...rows.map((row) => row.sequence));
  }

  return found;
}

function toChunks<Item>(items: readonly Item[]): Item[][] {
  const chunks: Item[][] = [];

  for (let start = 0; start < items.length; start += 400) {
    chunks.push(items.slice(start, start + 400));
  }

  return chunks;
}

async function requireNoOrphans(
  tx: Transaction<unknown>,
  removed: ReadonlySet<number>,
): Promise<void> {
  for (const chunk of toChunks([...removed])) {
    const rows = await readQueryRows(
      sql`select sequence from records where parent in (${sql.join(chunk)})`,
      tx,
      z.object({ sequence: z.number() }),
    );

    const orphan = rows.find((row) => !removed.has(row.sequence));

    if (orphan !== undefined) {
      throw new Error(
        `record ${String(orphan.sequence)} names a record of a built-in memory task as its parent, which the memory task migration cannot remove`,
      );
    }
  }
}

async function writeMovedRecords(
  tx: Transaction<unknown>,
  moved: readonly MovedRecord[],
): Promise<void> {
  for (const record of moved) {
    await sql`update records set thread = ${record.thread}, step_key = ${record.stepKey},
      proposal_id = ${record.proposalID}, approval_id = ${record.approvalID},
      action_hash = ${record.actionHash}, payload = ${record.payload}
      where sequence = ${record.sequence}`.execute(tx);
  }
}

async function removeRecords(tx: Transaction<unknown>, removed: readonly number[]): Promise<void> {
  for (const chunk of toChunks(removed)) {
    await sql`delete from record_attachments where sequence in (${sql.join(chunk)})`.execute(tx);
    await sql`delete from projection_changes where sequence in (${sql.join(chunk)})`.execute(tx);
    await sql`delete from records where sequence in (${sql.join(chunk)})`.execute(tx);
  }
}

// The rows of the 2 tasks, and the changes that a kept record made to them.
async function removeTaskRows(tx: Transaction<unknown>): Promise<void> {
  const ids = sql.join(taskIDs);

  await sql`delete from projection_changes
    where projection in ('memory_writer', 'memory_consolidations', 'memory_consolidation_changes')
      or (projection in ('tasks', 'pause_exemptions') and row_key in (${ids}))
      or (projection in ('timers', 'actions') and json_extract(row, '$.task_id') in (${ids}))
      or (projection = 'task_messages' and (json_extract(row, '$.from_task') in (${ids})
        or json_extract(row, '$.to_task') in (${ids})))`.execute(tx);

  await sql`delete from memory_writer`.execute(tx);
  await sql`delete from memory_consolidation_changes`.execute(tx);
  await sql`delete from memory_consolidations`.execute(tx);
  await sql`delete from timers where task_id in (${ids})`.execute(tx);
  await sql`delete from actions where task_id in (${ids})`.execute(tx);
  await sql`delete from leases where kind = 'task' and work_id in (${ids})`.execute(tx);
  await sql`delete from pause_exemptions where task_id in (${ids})`.execute(tx);
  await sql`delete from tasks where task_id in (${ids})`.execute(tx);

  await sql`delete from task_messages
    where from_task in (${ids}) or to_task in (${ids})`.execute(tx);

  await sql`delete from turn_inputs where task_id in (${ids})`.execute(tx);
  await sql`delete from turn_input_misses where task_id in (${ids})`.execute(tx);
  await sql`delete from turn_input_captures where task_id in (${ids})`.execute(tx);
}

interface RowTable {
  readonly table: string;
  readonly key: string;
  readonly columns: readonly string[];
}

const rowTables: readonly RowTable[] = [
  { table: 'memory_versions', key: 'version_key', columns: ['origin', 'task_id'] },
  {
    table: 'memory_proposals',
    key: 'proposal_id',
    columns: ['origin', 'task_id', 'thread', 'cap_group', 'notice_key'],
  },
  { table: 'memory_proposal_merges', key: 'merge_id', columns: ['origin', 'task_id', 'thread'] },
  { table: 'memory_notice_entries', key: 'entry_key', columns: ['thread', 'notice_key'] },
  { table: 'proposals', key: 'proposal_id', columns: ['task_id', 'thread'] },
];

async function rewriteProjectionRows(tx: Transaction<unknown>): Promise<void> {
  for (const entry of rowTables) {
    const checks = entry.columns.map((column) => buildStaleCheck(column));

    const rows = await readQueryRows(
      sql`select * from ${sql.table(entry.table)} where ${sql.join(checks, sql` or `)}`,
      tx,
      recordSchema,
    );

    for (const row of rows) {
      for (const [column, value] of Object.entries(toConversationRow(entry.table, row))) {
        if (value !== row[column]) {
          await sql`update ${sql.table(entry.table)}
            set ${sql.id(column)} = ${z.string().nullable().parse(value)}
            where ${sql.id(entry.key)} = ${z.string().parse(row[entry.key])}`.execute(tx);
        }
      }
    }
  }
}

function buildStaleCheck(column: string) {
  if (column === 'origin') {
    return sql`origin = 'memory_writer'`;
  }

  if (column === 'cap_group' || column === 'notice_key') {
    return sql`${sql.ref(column)} like ${'batch/%'}`;
  }

  return sql`${sql.ref(column)} in (${sql.join(taskIDs)})`;
}

function toConversationRow(
  projection: string,
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const isChange = projection === 'memory_versions' && row['task_id'] === consolidatorTaskID;

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, toMovedValue(key, value, isChange)]),
  );
}

const rewrittenProjections = rowTables.map((entry) => entry.table);
const staleText = ['memory_writer', 'memory-writer', 'memory-consolidator', 'batch/'];

async function rewriteProjectionChanges(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select sequence, projection, row_key, row from projection_changes
      where projection in (${sql.join(rewrittenProjections)}) and row is not null`,
    tx,
    z.object({
      sequence: z.number(),
      projection: z.string(),
      row_key: z.string(),
      row: z.string(),
    }),
  );

  for (const change of rows) {
    const parsed = recordSchema.safeParse(JSON.parse(change.row));

    if (!staleText.some((text) => change.row.includes(text)) || !parsed.success) {
      continue;
    }

    const next = JSON.stringify(toConversationRow(change.projection, parsed.data));

    if (next !== change.row) {
      await sql`update projection_changes set row = ${next}
        where sequence = ${change.sequence} and projection = ${change.projection}
          and row_key = ${change.row_key}`.execute(tx);
    }
  }
}

async function removeStoredPrompts(tx: Transaction<unknown>): Promise<void> {
  const ids = sql.join(retiredPromptIDs);
  const approvals = sql`(select approval_id from prompt_approvals where prompt_id in (${ids}))`;

  await sql`delete from prompt_export_attempts where approval_id in ${approvals}`.execute(tx);
  await sql`delete from prompt_exports where approval_id in ${approvals}`.execute(tx);

  await sql`delete from proposals where proposal_id in
    (select proposal_id from prompt_approvals where prompt_id in (${ids}))`.execute(tx);

  await sql`delete from prompt_approvals where prompt_id in (${ids})`.execute(tx);

  const rows = await readQueryRows(
    sql`select snapshot_hash, form from definition_snapshots
      where form like ${'%"writer"%'} or form like ${'%"consolidator"%'}`,
    tx,
    z.object({ snapshot_hash: z.string(), form: z.string() }),
  );

  for (const row of rows) {
    const form = recordSchema.safeParse(JSON.parse(row.form));
    const prompts = recordSchema.safeParse(form.data?.['prompts']);

    if (!form.success || !prompts.success) {
      continue;
    }

    await sql`update definition_snapshots
      set form = ${JSON.stringify({
        ...form.data,
        prompts: Object.fromEntries(
          Object.entries(prompts.data).filter(([promptID]) => !retiredPromptIDs.includes(promptID)),
        ),
      })}
      where snapshot_hash = ${row.snapshot_hash}`.execute(tx);
  }
}

// A record that leaves a thread or joins it shifts the counts of every later record on it.
async function rebuildThreads(tx: Transaction<unknown>): Promise<void> {
  await sql`delete from threads`.execute(tx);
  await sql`delete from projection_changes where projection = 'threads'`.execute(tx);

  await sql`insert into projection_changes (sequence, projection, row_key, row)
    select sequence, 'threads', thread, json_object(
      'thread', thread,
      'first_sequence', first_sequence,
      'last_sequence', sequence,
      'record_count', record_count,
      'last_recorded_at', recorded_at
    )
    from (
      select sequence, thread, recorded_at,
        first_value(sequence) over w as first_sequence,
        row_number() over w as record_count
      from records
      where thread is not null
      window w as (partition by thread order by sequence)
    )`.execute(tx);

  await sql`insert into threads
      (thread, first_sequence, last_sequence, record_count, last_recorded_at)
    select thread, min(sequence), max(sequence), count(*),
      (select last.recorded_at from records as last
        where last.sequence = (select max(sequence) from records as newest
          where newest.thread = grouped.thread))
    from records as grouped
    where thread is not null
    group by thread`.execute(tx);
}
