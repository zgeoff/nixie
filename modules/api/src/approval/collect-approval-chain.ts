export interface TaskLink {
  readonly isConversation: boolean;

  // the thread that started the task, or null for the conversation and a definition's task
  readonly startedBy: string | null;
}

const maxChainLength = 20;

// The task IDs from the one that started the work down to the asking task, following each task to
// the thread that started it. The walk stops at a conversation, at a task that nothing started, at
// an ID with no row, and on a repeat.
export function collectApprovalChain(
  links: ReadonlyMap<string, TaskLink>,
  askingTaskID: string,
): string[] {
  const chain = [askingTaskID];
  let link = links.get(askingTaskID);

  while (link !== undefined && !link.isConversation && link.startedBy !== null) {
    if (chain.includes(link.startedBy) || chain.length >= maxChainLength) {
      break;
    }

    chain.unshift(link.startedBy);

    link = links.get(link.startedBy);
  }

  return chain;
}
