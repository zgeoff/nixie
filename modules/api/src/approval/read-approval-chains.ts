import { writeTaskSessionNames } from '@heynixie/coding';
import type { TasksTables } from '@heynixie/tasks';
import { readStepOwnerText, readStepWakeCause, readTaskNames } from '@heynixie/tasks';
import type { APIContext } from '../types';
import type { TaskLink } from './collect-approval-chain';
import { collectApprovalChain } from './collect-approval-chain';
import type { StartingMessage } from './format-starting-message';
import { formatStartingMessage } from './format-starting-message';

export interface ApprovalChainStep {
  readonly kind: 'message' | 'task' | 'coding';
  readonly id: string;
  readonly name: string;
}

export interface ApprovalAsk {
  readonly proposalID: string;
  readonly taskID: string;

  // the sequence of the record that made the proposal
  readonly createdSequence: number;
}

// The chain of each proposal, by proposal ID: the message that started the work, each task and
// coding session after it, and the asking task last. Each step carries its short ID and a name,
// never a UUID. A task that nothing started, and an ID with no row, make a chain of that one step.
export async function readApprovalChains(
  context: APIContext,
  asks: readonly ApprovalAsk[],
): Promise<ReadonlyMap<string, ApprovalChainStep[]>> {
  if (asks.length === 0) {
    return new Map();
  }

  const links = await readTaskLinks(
    context,
    asks.map((ask) => ask.taskID),
  );

  const chains = asks.map((ask) => ({ ask, ids: collectApprovalChain(links, ask.taskID) }));

  const sessions = await writeTaskSessionNames(
    context,
    chains.flatMap((chain) => chain.ids),
  );

  const directory = new Map(context.settings.taskDirectory.map((task) => [task.taskID, task.name]));

  const started = await readTaskNames(context);

  const steps = await Promise.all(
    chains.map(async (chain) => {
      const starting = await readStartingMessage(context, links, chain.ask, chain.ids);

      return [
        chain.ask.proposalID,
        chain.ids.map((id): ApprovalChainStep => {
          const session = sessions.get(id);

          if (session !== undefined) {
            return {
              kind: 'coding',
              id: session,
              name: directory.get(id) ?? started.get(id) ?? id,
            };
          }

          if (links.get(id)?.isConversation === true) {
            return { kind: 'message', id, name: formatStartingMessage(starting) };
          }

          return { kind: 'task', id, name: directory.get(id) ?? started.get(id) ?? id };
        }),
      ] as const;
    }),
  );

  return new Map(steps);
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
      .select(['task_id', 'is_conversation', 'started_by', 'created_sequence'])
      .where('task_id', 'in', pending)
      .execute();

    for (const row of rows) {
      links.set(row.task_id, {
        isConversation: row.is_conversation === 1,
        startedBy: row.started_by,
        createdSequence: row.created_sequence,
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

// What woke the conversation step that started the work, and the owner's text when it was the
// owner, when the chain starts at the conversation. A task the conversation started was started by
// the step that ran just before it was created.
async function readStartingMessage(
  context: APIContext,
  links: ReadonlyMap<string, TaskLink>,
  ask: ApprovalAsk,
  ids: readonly string[],
): Promise<StartingMessage> {
  const [root, next] = ids;

  if (root === undefined || links.get(root)?.isConversation !== true) {
    return { cause: null, ownerText: null };
  }

  const beforeSequence =
    next === undefined
      ? ask.createdSequence
      : (links.get(next)?.createdSequence ?? ask.createdSequence);

  const cause = await readStepWakeCause(context, root, beforeSequence);

  return {
    cause,
    ownerText:
      cause?.kind === 'owner' ? await readStepOwnerText(context, root, beforeSequence) : null,
  };
}
