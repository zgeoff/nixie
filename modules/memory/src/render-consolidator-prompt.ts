import type { RecalledItem } from './types';

export interface ConsolidatorPromptInput {
  readonly items: readonly RecalledItem[];

  // whether the items are every active item, or only the ones that fit the list
  readonly isComplete: boolean;
}

// Renders the items the consolidator reads: each active item with its short ID, the date of its current
// version and whether it is pinned, oldest first, and under it the quote the version was saved from,
// when it has one. Each text and quote keeps to its one line, because outside content can reach them.
export function renderConsolidatorPrompt(input: ConsolidatorPromptInput): string {
  const heading = input.isComplete
    ? 'Current memory items (the complete list):'
    : 'Current memory items (not the complete list; find others with memory.recall):';

  const items =
    input.items.length === 0
      ? '(none)'
      : input.items
          .map(
            (item) =>
              `- ${item.shortID} (${formatDate(item.recordedAt)}${item.isPinned ? ', pinned' : ''}): ${formatLine(item.text)}${formatQuote(item.evidenceQuote)}`,
          )
          .join('\n');

  return `${heading}\n${items}`;
}

function formatDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function formatLine(text: string): string {
  return text.replaceAll(/\s+/gu, ' ');
}

function formatQuote(quote: string | null): string {
  return quote === null ? '' : `\n  quote: ${formatLine(quote)}`;
}
