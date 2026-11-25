import { buildMailTools } from '@heynixie/mail';
import type { MailHTMLReader, MailToolContext } from '@heynixie/mail';
import type { ToolDefinition } from '@heynixie/tools';

// The tools that a model calls on the assistant's own mailbox, or none without a mailbox. A mail's
// HTML reads in the same fetch sandbox as a page.
export function buildServerMailTools(
  context: MailToolContext | null,
  reader: MailHTMLReader,
): ToolDefinition[] {
  return context === null ? [] : buildMailTools(context, reader);
}
