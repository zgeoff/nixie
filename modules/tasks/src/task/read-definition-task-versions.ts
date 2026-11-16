import { probeDefinitionRunToEnd } from '../run/probe-definition-run-to-end';
import { readRunRows } from '../run/read-run-rows';
import type { DefinitionVersion, TaskRow, TasksContext, TasksTables } from '../types';

export interface DefinitionTaskVersion {
  readonly taskID: string;
  readonly definitionID: string;
  readonly definitionHash: string;
  readonly version: DefinitionVersion;

  // whether the version is the one in force, and not one that a task run of a task out of force pins
  readonly isInForce: boolean;
}

// The version that each definition's task shows: the one in force, or for a task out of force that
// still has a task run to end, the one its newest task run pins. A task whose version is not stored
// is left out.
export async function readDefinitionTaskVersions(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
): Promise<readonly DefinitionTaskVersion[]> {
  const db = context.log.writer.db;

  const rows = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'definition_id', 'definition_hash'])
    .where('definition_id', 'is not', null)
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

  if (!(await probeDefinitionRunToEnd(db, row.task_id))) {
    return null;
  }

  const runs = await readRunRows(db, row.task_id);

  const pinned = runs.at(-1)?.opened.definitionHash ?? null;

  return pinned === null ? null : { hash: pinned, isInForce: false };
}
