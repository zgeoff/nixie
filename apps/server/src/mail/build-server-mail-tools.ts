import { buildMailTools } from '@heynixie/mail';
import type { MailToolContext } from '@heynixie/mail';
import type { ToolDefinition } from '@heynixie/tools';

// The tools that a model calls on the assistant's own mailbox, or none without a mailbox.
export function buildServerMailTools(context: MailToolContext | null): ToolDefinition[] {
  return context === null ? [] : buildMailTools(context);
}
