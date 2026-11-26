import { pickRunDefinition } from '../run/pick-run-definition';
import { readDefinitionRunFacts } from '../run/read-definition-run-facts';
import type { DefinitionVersion, TaskRow, TasksContext, TasksTables } from '../types';

export interface DefinitionTaskVersion {
  readonly taskID: string;
  readonly definitionID: string;
  readonly definitionHash: string;
  readonly version: DefinitionVersion;

  // whether the version is the one in force, and not one that a task run of a task out of force pins
  readonly isInForce: boolean;
}

export interface DefinitionTaskVersionQuery {
  // leaves out each task out of force, whose version takes a read of its task runs
  readonly isInForceOnly?: boolean;

  // reads only these tasks
  readonly taskIDs?: readonly string[];
}

// The version that each definition's task shows: the one in force, or for a task out of force that
// still has a task run to end, the one its pending or open task run pins. A task whose version is not stored
// is left out.
export async function readDefinitionTaskVersions(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  query: DefinitionTaskVersionQuery = {},
): Promise<readonly DefinitionTaskVersion[]> {
  const db = context.log.writer.db;

  const rows = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'definition_id', 'definition_hash'])
    .where('definition_id', 'is not', null)
    .$if(query.isInForceOnly === true, (builder) =>
      builder.where('definition_hash', 'is not', null),
    )
    .$if(query.taskIDs !== undefined, (builder) =>
      builder.where('task_id', 'in', query.taskIDs ?? []),
    )
    .orderBy('created_sequence')
    .execute();

  const versions: DefinitionTaskVersion[] = [];

  for (const row of rows) {
    const shown = await readShownHash(context, row);

    if (shown === null || row.definition_id === null) {
      continue;
    }

    const version = await context.readDefinitionVersion(db, shown.hash);

    if (version !== null) {
      versions.push({
        taskID: row.task_id,
        definitionID: row.definition_id,
        definitionHash: shown.hash,
        version,
        isInForce: shown.isInForce,
      });
    }
  }

  return versions;
}

interface ShownHash {
  readonly hash: string;
  readonly isInForce: boolean;
}

async function readShownHash(
  context: Pick<TasksContext, 'log'>,
  row: Pick<TaskRow, 'task_id' | 'definition_hash'>,
): Promise<ShownHash | null> {
  if (row.definition_hash !== null) {
    return { hash: row.definition_hash, isInForce: true };
  }

  const db = context.log.writer.db;

  const read = await readDefinitionRunFacts(db, row.task_id);

  if (read === null) {
    return null;
  }

  // a pending task run pins the hash of the pick that opens it, which a fire can make another than
  // the newest task run's
  const pick = pickRunDefinition(read.facts);

  if (pick.kind === 'open') {
    return { hash: pick.definitionHash, isInForce: false };
  }

  const pinned = read.runs.find((run) => run.ended === null)?.opened.definitionHash ?? null;

  return pinned === null ? null : { hash: pinned, isInForce: false };
}
