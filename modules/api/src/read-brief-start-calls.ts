import type { ErasableFields } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksTables } from '@heynixie/tasks';
import { sql } from 'kysely';
import { z } from 'zod';
import type { APIContext, APITables } from './types';

// The call keeps no task ID, so the search runs through its result, which names the task. A call
// with no result matches only by the brief's text, so the search must run while the brief is still
// readable.
export async function readBriefStartCalls(
  context: Pick<APIContext, 'log'>,
  brief: number,
): Promise<readonly number[]> {
  const db = context.log.writer.db.$extendTables<APITables>();

  const message = await db
    .selectFrom('records')
    .select(['thread', sql`json_extract(payload, '$.messageID')`.as('message_id')])
    .where('sequence', '=', brief)
    .where('kind', '=', 'task_message')
    .executeTakeFirst();

  const messageID = z
    .string()
    .nullable()
    .parse(message?.message_id ?? null);

  const thread = message?.thread ?? null;

  if (thread === null || messageID === null) {
    return [];
  }

  const task = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .innerJoin('records', 'records.sequence', 'tasks.created_sequence')
    .select([
      'tasks.started_by',
      'tasks.created_sequence',
      sql`json_extract(records.payload, '$.briefMessageID')`.as('brief_message_id'),
    ])
    .where('tasks.task_id', '=', thread)
    .executeTakeFirst();

  const starter = task?.started_by ?? null;

  if (task === undefined || starter === null) {
    return [];
  }

  if (z.string().nullable().parse(task.brief_message_id) !== messageID) {
    return [];
  }

  const calls = await db
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'tool_called')
    .where('thread', '=', starter)
    .where(sql`json_extract(payload, '$.tool')`, '=', 'task.start')
    .execute();

  if (calls.length === 0) {
    return [];
  }

  const results = await db
    .selectFrom('records')
    .select(['sequence', 'parent'])
    .where('kind', '=', 'tool_result')
    .where('thread', '=', starter)
    .where(
      'parent',
      'in',
      calls.map((call) => call.sequence),
    )
    .execute();

  const entries = await readRecords(context.log, {
    afterSequence: 0,
    sequences: results
      .filter((result) => result.sequence > task.created_sequence)
      .map((result) => result.sequence),
    limit: Math.max(results.length, 1),
  });

  const started = new Set(
    entries
      .filter((entry) => isResultOfTask(entry.record.erasable, thread))
      .map((entry) => entry.record.parent),
  );

  // A crash after the start committed and before its result did leaves a call with no result. Such a
  // call names the task by its input alone: the same name and the same brief.
  const answered = new Set(results.map((result) => result.parent));

  const unanswered = calls.filter((call) => !answered.has(call.sequence));

  const identity = await readStartIdentity(context, {
    createdSequence: task.created_sequence,
    brief,
  });

  const inputs = await readRecords(context.log, {
    afterSequence: 0,
    sequences: unanswered.map((call) => call.sequence),
    limit: Math.max(unanswered.length, 1),
  });

  for (const entry of inputs) {
    if (isInputOfTask(entry.record.erasable, identity)) {
      started.add(entry.record.sequence);
    }
  }

  return [...started]
    .filter((sequence) => sequence !== null)
    .toSorted((left, right) => left - right);
}

const startResultSchema = z.object({ taskID: z.string() });

function isResultOfTask(erasable: ErasableFields, taskID: string): boolean {
  if (erasable.status !== 'readable') {
    return false;
  }

  return startResultSchema.safeParse(erasable.fields['result']).data?.taskID === taskID;
}

interface StartIdentity {
  readonly name: string | null;
  readonly brief: string | null;
}

interface StartSequences {
  readonly createdSequence: number;
  readonly brief: number;
}

async function readStartIdentity(
  context: Pick<APIContext, 'log'>,
  sequences: StartSequences,
): Promise<StartIdentity> {
  const entries = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [sequences.createdSequence, sequences.brief],
    limit: 2,
  });

  const read = (sequence: number, field: string): string | null => {
    const erasable = entries.find((entry) => entry.record.sequence === sequence)?.record.erasable;

    if (erasable?.status !== 'readable') {
      return null;
    }

    const value = erasable.fields[field];

    return typeof value === 'string' ? value : null;
  };

  return {
    name: read(sequences.createdSequence, 'name'),
    brief: read(sequences.brief, 'body'),
  };
}

const startInputSchema = z.object({ name: z.string(), brief: z.string() });

function isInputOfTask(erasable: ErasableFields, identity: StartIdentity): boolean {
  if (erasable.status !== 'readable' || identity.name === null || identity.brief === null) {
    return false;
  }

  const input = startInputSchema.safeParse(erasable.fields['input']).data;

  return input?.name.trim() === identity.name && input.brief === identity.brief;
}
