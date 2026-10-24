import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import type { TaskMessaging, TaskProfile } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';

interface MessagingConfig {
  readonly memory_writer: { readonly isEnabled: boolean };
  readonly memory_consolidation: { readonly isEnabled: boolean };
  readonly owner: { readonly name: string | null };
  readonly tasks: { readonly messaging: { readonly hopLimit: number } };
}

export function buildTaskMessaging(config: MessagingConfig): TaskMessaging {
  const owner = config.owner.name ?? 'the owner';

  const conversation: TaskProfile = {
    taskID: conversationTaskID,
    name: 'Conversation',
    brief: `Talks with ${owner} and answers each message.`,
    isWokenByMessages: true,
  };

  const writer: TaskProfile = {
    taskID: memoryWriterTaskID,
    name: 'Memory writer',
    brief: `Reads the conversation in batches and saves or proposes what ${owner} says as memory. Runs on its own schedule.`,
    isWokenByMessages: false,
  };

  const consolidator: TaskProfile = {
    taskID: memoryConsolidatorTaskID,
    name: 'Memory consolidator',
    brief: `Tidies memory on its own schedule, and proposes merges, rewrites and retirements for ${owner} to review.`,
    isWokenByMessages: false,
  };

  return {
    directory: [
      conversation,
      ...(config.memory_writer.isEnabled ? [writer] : []),
      ...(config.memory_consolidation.isEnabled ? [consolidator] : []),
    ],
    hopLimit: config.tasks.messaging.hopLimit,
    ownerName: config.owner.name,
  };
}
