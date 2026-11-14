import type { ToolDefinition } from '@heynixie/tools';
import type { ConversationMemory } from './build-conversation-memory-tools';
import { buildConversationMemoryTools } from './build-conversation-memory-tools';

export interface ConversationReaders {
  readonly webFetch: ToolDefinition;
  readonly time: ToolDefinition;
  readonly logReaders: readonly ToolDefinition[];
  readonly skills: readonly ToolDefinition[];
  readonly prompts: readonly ToolDefinition[];
  readonly tasks: readonly ToolDefinition[];
}

export function buildConversationTools(
  readers: ConversationReaders,
  memory: ConversationMemory,
): readonly ToolDefinition[] {
  return [
    readers.webFetch,
    readers.time,
    ...readers.logReaders,
    ...readers.skills,
    ...readers.prompts,
    ...readers.tasks,
    ...buildConversationMemoryTools(memory),
  ];
}
