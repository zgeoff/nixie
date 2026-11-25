import type { ActionsTables } from '@heynixie/actions';
import type { Log, LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import { codingToolNames } from '../connector/coding-tool-names';
import { codingDeliveredCodec } from '../record/coding-delivered-codec';
import { readOpenBindings } from '../session/read-open-bindings';
import { sessionEventSchema } from '../source/session-event-schema';
import type { Binding, SessionEvent } from '../types';
import type { DeliveredNote, QueuedInput } from './collect-coding-step';
import type { InboxItem } from './to-inbox-item';

export interface StoredStepFacts {
  readonly queued: ReadonlyMap<string, QueuedInput>;
  readonly delivered: readonly DeliveredNote[];
  readonly hasPendingNote: boolean;
  readonly heldEvents: ReadonlyMap<number, SessionEvent>;
  readonly sessionOwners: ReadonlyMap<string, string>;
}

export interface StepFactsRequest {
  readonly taskID: string;
  readonly adapterID: string;
  readonly binding: Binding | null;
  readonly inbox: readonly InboxItem[];
}

// What a coding step reads beside its inbox, only for what the inbox names: the input of the steers
// and notes whose outcomes it holds, the delivered notes its answers name, whether a note still waits
// on its outcome, the events of the held answers, and the task that binds each session it spawned.
export async function readStepFacts(log: Log, request: StepFactsRequest): Promise<StoredStepFacts> {
  const outcomes = request.inbox.filter((item) => item.kind === 'outcome');

  return {
    queued: await readQueued(log, outcomes),
    delivered: await readDelivered(log, request.taskID, request.inbox),
    hasPendingNote: await probePendingNote(log, request.taskID, request.inbox),
    heldEvents: await readHeldEvents(log, request.binding),
    sessionOwners: await readSessionOwners(log, request.adapterID, outcomes),
  };
}

// The input of the steers and notes whose outcomes the inbox holds, from their action.queued records.
async function readQueued(
  log: Log,
  outcomes: readonly InboxItem[],
): Promise<ReadonlyMap<string, QueuedInput>> {
  const actionIDs = outcomes.flatMap((item) =>
    item.kind === 'outcome' && isInputTool(item.tool) ? [item.actionID] : [],
  );

  const queued = new Map<string, QueuedInput>();

  for (const chunk of collectChunks(actionIDs)) {
    await readQueuedChunk(log, chunk, queued);
  }

  return queued;
}

function isInputTool(tool: string): boolean {
  return tool === codingToolNames.steer || tool === codingToolNames.message;
}

// SQLite caps the variables of one statement, and an inbox has no cap, so each list of IDs that a
// read binds goes in chunks.
const chunkSize = 500;

function collectChunks<T>(values: readonly T[]): T[][] {
  const chunks: T[][] = [];

  for (let start = 0; start < values.length; start += chunkSize) {
    chunks.push(values.slice(start, start + chunkSize));
  }

  return chunks;
}

const queuedArgumentsSchema = z.object({
  hop: z.int().default(0),
  messageID: z.string().nullable().default(null),
  from: z.string().nullable().default(null),
});

const argumentsFieldSchema = z.object({ arguments: queuedArgumentsSchema });

async function readQueuedChunk(
  log: Log,
  actionIDs: readonly string[],
  queued: Map<string, QueuedInput>,
): Promise<void> {
  const rows = await log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'queued_sequence'])
    .where('action_id', 'in', actionIDs)
    .execute();

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.queued_sequence),
    limit: rows.length,
  });

  const actionBySequence = new Map(rows.map((row) => [row.queued_sequence, row.action_id]));

  for (const entry of entries) {
    const record = entry.record;
    const fields = record.erasable.status === 'readable' ? record.erasable.fields : {};
    const input = argumentsFieldSchema.safeParse(fields);
    const actionID = actionBySequence.get(record.sequence);

    if (actionID !== undefined && input.success) {
      queued.set(actionID, input.data.arguments);
    }
  }
}

// The delivered notes that the inbox's answers name by their message ref.
async function readDelivered(
  log: Log,
  taskID: string,
  inbox: readonly InboxItem[],
): Promise<DeliveredNote[]> {
  const delivered: DeliveredNote[] = [];

  for (const chunk of collectChunks(collectAnswerRefs(inbox))) {
    delivered.push(...(await readDeliveredChunk(log, taskID, chunk)));
  }

  return delivered;
}

function collectAnswerRefs(inbox: readonly InboxItem[]): string[] {
  return inbox.flatMap((item) =>
    item.kind === 'event' && (item.event?.kind === 'answered' || item.event?.kind === 'unanswered')
      ? [item.event.messageRef]
      : [],
  );
}

async function readDeliveredChunk(
  log: Log,
  taskID: string,
  messageRefs: readonly string[],
): Promise<DeliveredNote[]> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('thread', '=', taskID)
    .where('kind', '=', codingDeliveredCodec.kind)
    .where(sql`json_extract(payload, '$.messageRef')`, 'in', messageRefs)
    .execute();

  if (rows.length === 0) {
    return [];
  }

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.sequence),
    limit: rows.length,
  });

  return entries.map((entry) => {
    const note = codingDeliveredCodec.decode(entry.record.payload);

    return { messageRef: note.messageRef, messageID: note.messageID, from: note.from };
  });
}

// A note waits on its outcome while it is queued, held by a pause, in an attempt or unknown, and
// while its done outcome sits after the inbox the step read, so no step has read it yet.
async function probePendingNote(
  log: Log,
  taskID: string,
  inbox: readonly InboxItem[],
): Promise<boolean> {
  const readUpTo = inbox.reduce((newest, item) => Math.max(newest, item.sequence), 0);

  const row = await log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('action_id')
    .where('task_id', '=', taskID)
    .where('tool', '=', codingToolNames.message)
    .where('cancelled_sequence', 'is', null)
    .where((expression) =>
      expression.or([
        expression('status', 'in', ['pending', 'unknown']),
        expression.and([
          expression('status', '=', 'done'),
          expression('outcome_sequence', '>', readUpTo),
        ]),
      ]),
    )
    .executeTakeFirst();

  return row !== undefined;
}

async function readHeldEvents(
  log: Log,
  binding: Binding | null,
): Promise<ReadonlyMap<number, SessionEvent>> {
  const sequences = binding?.heldAnswers.map((held) => held.sequence) ?? [];

  if (sequences.length === 0) {
    return new Map();
  }

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences,
    limit: sequences.length,
  });

  const events = new Map<number, SessionEvent>();

  for (const entry of entries) {
    const record = entry.record;
    const fields = record.erasable.status === 'readable' ? record.erasable.fields : {};
    const event = sessionEventSchema.safeParse(fields['event']);

    if (event.success) {
      events.set(record.sequence, event.data);
    }
  }

  return events;
}

const spawnedSchema = z.object({ sessionID: z.string() });

// The open coding task that binds each session that a done spawn outcome of the inbox names.
function readSessionOwners(
  log: Log,
  adapterID: string,
  outcomes: readonly InboxItem[],
): Promise<ReadonlyMap<string, string>> {
  const sessionIDs = outcomes.flatMap((item) => {
    if (item.kind !== 'outcome' || item.tool !== codingToolNames.start || item.status !== 'done') {
      return [];
    }

    const spawned = spawnedSchema.safeParse(item.result);

    return spawned.success ? [spawned.data.sessionID] : [];
  });

  return readOpenBindings(log.writer.db, adapterID, sessionIDs);
}
