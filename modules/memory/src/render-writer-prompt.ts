import type { BatchMessage } from './writer-types';

// One current item as the writer is shown it, with the version its change binds to.
export interface ShownItem {
  readonly itemID: string;
  readonly version: number;
  readonly text: string;
}

export interface WriterPromptInput {
  readonly items: readonly ShownItem[];

  // whether the items are every active item, or only those that matched the batch
  readonly isComplete: boolean;
  readonly messages: readonly BatchMessage[];
}

// Renders the batch the writer reads: the current items, then each message with its ID, its date
// and who wrote it, oldest first.
export function renderWriterPrompt(input: WriterPromptInput): string {
  const heading = input.isComplete
    ? 'Current memory items (the complete list):'
    : 'Current memory items that match this batch (not the complete list):';
  const items =
    input.items.length === 0
      ? '(none)'
      : input.items.map((item) => `- ${item.itemID}: ${item.text}`).join('\n');
  const messages = input.messages
    .map(
      (message) =>
        `[${String(message.sequence)}] ${formatDate(message.recordedAt)} ${message.role}: ${message.shown}`,
    )
    .join('\n\n');

  return `${heading}\n${items}\n\nMessages in this batch:\n\n${messages}`;
}

function formatDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
