import type { ActionsTables } from '@heynixie/actions';
import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import { codingToolNames } from '../connector/coding-tool-names';
import { codingDeliveredCodec } from '../record/coding-delivered-codec';
import { sessionEventSchema } from '../source/session-event-schema';
import type { Binding, SessionEvent } from '../types';
import type { DeliveredNote, QueuedInput } from './collect-coding-step';

export interface StoredStepFacts {
  readonly queued: ReadonlyMap<string, QueuedInput>;
  readonly delivered: readonly DeliveredNote[];
  readonly hasPendingNote: boolean;
  readonly heldEvents: ReadonlyMap<number, SessionEvent>;
}

const queuedPayloadSchema = z.object({ actionID: z.string(), tool: z.string() });

const queuedArgumentsSchema = z.object({
  hop: z.int().default(0),
  messageID: z.string().nullable().default(null),
  from: z.string().nullable().default(null),
});

const argumentsFieldSchema = z.object({ arguments: queuedArgumentsSchema });

// What a coding step reads beside its inbox: the input of the task's steers and notes, the notes the
// session got, whether a note still waits on its outcome, and the events of the held answers.
export async function readStepFacts(
  log: Log,
  taskID: string,
  binding: Binding | null,
): Promise<StoredStepFacts> {
  const records = await readThreadRecords(log, taskID);

  const queued = new Map<string, QueuedInput>();

  const delivered: DeliveredNote[] = [];

  for (const record of records) {
    if (record.kind === 'action.queued') {
      const payload = queuedPayloadSchema.parse(record.payload);
      const fields = record.erasable.status === 'readable' ? record.erasable.fields : {};
      const input = argumentsFieldSchema.safeParse(fields);

      if (isInputTool(payload.tool) && input.success) {
        queued.set(payload.actionID, input.data.arguments);
      }
    }

    if (record.kind === codingDeliveredCodec.kind) {
      const note = codingDeliveredCodec.decode(record.payload);

      delivered.push({ messageRef: note.messageRef, messageID: note.messageID, from: note.from });
    }
  }

  return {
    queued,
    delivered,
    hasPendingNote: await probePendingNote(log, taskID),
    heldEvents: await readHeldEvents(log, binding),
  };
}

async function readThreadRecords(log: Log, taskID: string) {
  const entries = await readRecords(log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['action.queued', codingDeliveredCodec.kind],
    limit: 10_000,
  });

  return entries.map((entry) => entry.record);
}

function isInputTool(tool: string): boolean {
  return tool === codingToolNames.steer || tool === codingToolNames.message;
}

// A note waits on its outcome while it is queued, held by a pause, in an attempt or unknown.
async function probePendingNote(log: Log, taskID: string): Promise<boolean> {
  const row = await log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('action_id')
    .where('task_id', '=', taskID)
    .where('tool', '=', codingToolNames.message)
    .where('status', 'in', ['pending', 'unknown'])
    .where('cancelled_sequence', 'is', null)
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

  const entries = await readRecords(log, { afterSequence: 0, sequences });

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
