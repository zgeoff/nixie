import { createShortID } from '@heynixie/db';
import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import { taskDefinitionSetCodec } from '../task/codec/task-definition-set-codec';
import type { TasksContext, TasksTables } from '../types';

export interface DefinitionInForce {
  readonly definitionID: string;
  readonly definitionHash: string;
}

export interface DefinitionTasksWritten {
  readonly created: number;
  readonly set: number;
  readonly withdrawn: number;
}

type WriteContext = Pick<TasksContext, 'definitions' | 'log'>;

// The seed's hook, which the caller runs inside the seed's transaction. A definition with no task
// gets one, a task that holds another hash or none takes the list's hash, and a task whose
// definition left the list drops its hash.
export async function writeDefinitionTasksInTransaction(
  tx: Transaction<unknown>,
  context: WriteContext,
  inForce: readonly DefinitionInForce[],
): Promise<DefinitionTasksWritten> {
  const rows = await readDefinitionTasks(tx);

  const records: RecordInput[] = [];
  const written = { created: 0, set: 0, withdrawn: 0 };

  for (const definition of inForce) {
    const row = rows.find((candidate) => candidate.definitionID === definition.definitionID);

    if (row === undefined) {
      const taskID = createShortID();

      records.push(
        buildCreated(context, taskID),
        buildSet(context, {
          taskID,
          definitionID: definition.definitionID,
          definitionHash: definition.definitionHash,
        }),
      );

      written.created += 1;
    } else if (row.definitionHash !== definition.definitionHash) {
      records.push(buildSet(context, { ...row, definitionHash: definition.definitionHash }));

      written.set += 1;
    }
  }

  for (const row of rows) {
    if (
      row.definitionHash !== null &&
      !inForce.some((definition) => definition.definitionID === row.definitionID)
    ) {
      records.push(buildSet(context, { ...row, definitionHash: null }));

      written.withdrawn += 1;
    }
  }

  await writeRecordsInTransaction(tx, context.log, records);

  return written;
}

interface DefinitionTaskRow {
  readonly definitionID: string;
  readonly taskID: string;
  readonly definitionHash: string | null;
}

async function readDefinitionTasks(
  tx: Transaction<unknown>,
): Promise<readonly DefinitionTaskRow[]> {
  const rows = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'definition_id', 'definition_hash'])
    .where('definition_id', 'is not', null)
    .orderBy('created_sequence')
    .execute();

  return rows.flatMap((row) =>
    row.definition_id === null
      ? []
      : [
          {
            definitionID: row.definition_id,
            taskID: row.task_id,
            definitionHash: row.definition_hash,
          },
        ],
  );
}

function buildCreated(context: Pick<TasksContext, 'definitions'>, taskID: string): RecordInput {
  return {
    kind: 'task.created',
    definitions: context.definitions(),
    thread: taskID,
    payload: taskCreatedCodec.encode({ taskID, isConversation: false, state: 'waiting' }),
  };
}

function buildSet(context: Pick<TasksContext, 'definitions'>, row: DefinitionTaskRow): RecordInput {
  return {
    kind: 'task.definition_set',
    definitions: context.definitions(),
    thread: row.taskID,
    payload: taskDefinitionSetCodec.encode(row),
  };
}
