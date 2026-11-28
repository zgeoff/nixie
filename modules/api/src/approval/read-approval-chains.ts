import { readSessionShortIDs } from '@heynixie/coding';
import type { TasksTables } from '@heynixie/tasks';
import { readTaskNames } from '@heynixie/tasks';
import type { APIContext } from '../types';
import type { TaskLink } from './collect-approval-chain';
import { collectApprovalChain } from './collect-approval-chain';

export interface ApprovalChainStep {
  readonly kind: 'message' | 'task' | 'coding';
  readonly id: string;
  readonly name: string;
}

// The chain of each asking task: the conversation that started the work, each task and coding
// session after it, and the asking task last. Each step carries its short ID and a name, never a
// UUID. A task that nothing started, and an ID with no row, make a chain of that one step.
export async function readApprovalChains(
  context: APIContext,
  askingTaskIDs: readonly string[],
): Promise<ReadonlyMap<string, ApprovalChainStep[]>> {
  if (askingTaskIDs.length === 0) {
    return new Map();
  }

  const links = await readTaskLinks(context, askingTaskIDs);

  const chains = new Map(
    [...new Set(askingTaskIDs)].map((taskID) => [taskID, collectApprovalChain(links, taskID)]),
  );

  const stepIDs = [...new Set([...chains.values()].flat())];

  const sessions = await readSessionShortIDs(context.log.writer.db, stepIDs);

  const directory = new Map(context.settings.taskDirectory.map((task) => [task.taskID, task.name]));

  const started = await readTaskNames(context);

  return new Map(
    [...chains].map(([taskID, ids]) => [
      taskID,
      ids.map((id): ApprovalChainStep => {
        const name = directory.get(id) ?? started.get(id) ?? id;
        const session = sessions.get(id);

        if (session !== undefined) {
          return { kind: 'coding', id: session, name };
        }

        return { kind: links.get(id)?.isConversation === true ? 'message' : 'task', id, name };
      }),
    ]),
  );
}

async function readTaskLinks(
  context: APIContext,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, TaskLink>> {
  const db = context.log.writer.db.$extendTables<TasksTables>();

  const links = new Map<string, TaskLink>();

  let pending = [...new Set(taskIDs)];

  while (pending.length > 0) {
    const rows = await db
      .selectFrom('tasks')
      .select(['task_id', 'is_conversation', 'started_by'])
      .where('task_id', 'in', pending)
      .execute();

    for (const row of rows) {
      links.set(row.task_id, {
        isConversation: row.is_conversation === 1,
        startedBy: row.started_by,
      });
    }

    const parents = rows.flatMap((row) => (row.started_by === null ? [] : [row.started_by]));

    pending = collectUnread(parents, links);
  }

  return links;
}

function collectUnread(ids: readonly string[], links: ReadonlyMap<string, TaskLink>): string[] {
  return [...new Set(ids)].filter((id) => !links.has(id));
}
