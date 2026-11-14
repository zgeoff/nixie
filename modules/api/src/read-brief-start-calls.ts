import type { ErasableFields } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksTables } from '@heynixie/tasks';
import { sql } from 'kysely';
import { z } from 'zod';
import type { APIContext, APITables } from './types';

export interface BriefStartCall {
  readonly sequence: number;
  readonly keyID: string | null;
}

// The starter's recorded task.start call holds the brief's text in its input. The call keeps no
// task ID, so the search runs through its result, which names the task. A rerun of the starting
// step can leave more than one such call.
export async function readBriefStartCalls(
  context: Pick<APIContext, 'log'>,
  brief: number,
): Promise<readonly BriefStartCall[]> {
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
    .where('sequence', '>', task.created_sequence)
    .where(
      'parent',
      'in',
      calls.map((call) => call.sequence),
    )
    .execute();

  if (results.length === 0) {
    return [];
  }

  const entries = await readRecords(context.log, {
    afterSequence: 0,
    sequences: results.map((result) => result.sequence),
    limit: results.length,
  });

  const started = new Set(
    entries
      .filter((entry) => isResultOfTask(entry.record.erasable, thread))
      .map((entry) => entry.record.parent),
  );

  const sequences = [...started].filter((sequence) => sequence !== null);

  if (sequences.length === 0) {
    return [];
  }

  return db
    .selectFrom('records')
    .select(['sequence', 'key_id as keyID'])
    .where('sequence', 'in', sequences)
    .orderBy('sequence')
    .execute();
}

const startResultSchema = z.object({ taskID: z.string() });

function isResultOfTask(erasable: ErasableFields, taskID: string): boolean {
  if (erasable.status !== 'readable') {
    return false;
  }

  return startResultSchema.safeParse(erasable.fields['result']).data?.taskID === taskID;
}
