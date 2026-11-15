import { memoryConsolidatorTaskID } from '@heynixie/memory';
import type { TaskMessaging, TaskProfile } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';

interface MessagingConfig {
  readonly memory_consolidation: { readonly isEnabled: boolean };
  readonly owner: { readonly name: string | null };
  readonly agent: { readonly names: readonly string[] };
  readonly tasks: { readonly messaging: { readonly hopLimit: number } };
}

export function buildTaskMessaging(config: MessagingConfig): TaskMessaging {
  const owner = config.owner.name ?? 'the owner';

  const conversation: TaskProfile = {
    taskID: conversationTaskID,
    name: 'Conversation',
    brief: `Talks with ${owner} and answers each message.`,
    isWokenByMessages: true,
    speaker: 'conversation',
  };

  const consolidator: TaskProfile = {
    taskID: memoryConsolidatorTaskID,
    name: 'Memory consolidator',
    brief: `Tidies memory on its own schedule, and proposes merges, rewrites and retirements for ${owner} to review.`,
    isWokenByMessages: false,
    speaker: 'plain_task',
  };

  return {
    directory: [conversation, ...(config.memory_consolidation.isEnabled ? [consolidator] : [])],
    hopLimit: config.tasks.messaging.hopLimit,
    ownerName: config.owner.name,
    agentName: config.agent.names[0] ?? null,
  };
}
