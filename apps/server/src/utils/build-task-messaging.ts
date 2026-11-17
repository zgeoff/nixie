import type { TaskMessaging, TaskProfile } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';

interface MessagingConfig {
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
    wakeable: true,
    speaker: 'conversation',
  };

  return {
    directory: [conversation],
    unlisted: [],
    hopLimit: config.tasks.messaging.hopLimit,
    ownerName: config.owner.name,
    agentName: config.agent.names[0] ?? null,
  };
}
