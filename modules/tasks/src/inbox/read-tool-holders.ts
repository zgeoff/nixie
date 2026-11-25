import { parseJSONObject, readRecords } from '@heynixie/log';
import { isFinishedState } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { taskRunOpenedCodec } from '../run/task-run-opened-codec';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import type { TasksContext, TasksTables } from '../types';

// The tasks with an open task run whose tool list holds the tool, by its name or by `<server>.*`.
// A definition's task run holds the tools of the version it pinned, and a started task the tools it
// was started with. The caller holds the writer's write transaction, so the read sits inside it.
export async function readToolHolders(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  tool: string,
): Promise<readonly string[]> {
  const db = tx.$extendTables<TasksTables>();

  const runs = await db
    .selectFrom('task_runs')
    .innerJoin('tasks', 'tasks.task_id', 'task_runs.task_id')
    .select([
      'task_runs.task_id as task_id',
      'task_runs.opened as opened',
      'tasks.state as state',
      'tasks.created_sequence as created_sequence',
    ])
    .where('task_runs.ended_sequence', 'is', null)
    .execute();

  const log = { ...context.log, writer: { ...context.log.writer, db: tx } };
  const holders: string[] = [];

  for (const run of runs.filter((candidate) => !isFinishedState(candidate.state))) {
    const opened = taskRunOpenedCodec.decode(parseJSONObject(run.opened));

    const tools = await readRunTools(context, {
      tx,
      log,
      run: opened,
      createdSequence: run.created_sequence,
    });

    if (tools.some((name) => isNamed(name, tool))) {
      holders.push(run.task_id);
    }
  }

  return holders;
}

interface RunToolsRead {
  readonly tx: Transaction<unknown>;
  readonly log: TasksContext['log'];
  readonly run: ReturnType<typeof taskRunOpenedCodec.decode>;
  readonly createdSequence: number;
}

async function readRunTools(
  context: Pick<TasksContext, 'readDefinitionVersion'>,
  read: RunToolsRead,
): Promise<readonly string[]> {
  if (read.run.definitionHash === null) {
    return readStartedTools(read.log, read.createdSequence);
  }

  const version = await context.readDefinitionVersion(read.tx, read.run.definitionHash);

  return version?.tools ?? [];
}

async function readStartedTools(
  log: TasksContext['log'],
  createdSequence: number,
): Promise<readonly string[]> {
  const [created] = await readRecords(log, { afterSequence: 0, sequences: [createdSequence] });

  return created === undefined
    ? []
    : (taskCreatedCodec.decode(created.record.payload).options?.tools ?? []);
}

function isNamed(entry: string, tool: string): boolean {
  return entry === tool || (entry.endsWith('.*') && tool.startsWith(entry.slice(0, -1)));
}
