import type { RecalledItem } from './types';

export interface ConsolidatorPromptInput {
  readonly items: readonly RecalledItem[];

  // whether the items are every active item, or only the ones that fit the list
  readonly isComplete: boolean;
}

// Renders the items the consolidator reads: each active item with its short ID, the date of its current
// version and whether it is pinned, oldest first. Each text keeps to its one line, because outside
// content can reach an item's text.
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
              `- ${item.shortID} (${formatDate(item.recordedAt)}${item.isPinned ? ', pinned' : ''}): ${item.text.replaceAll(/\s+/gu, ' ')}`,
          )
          .join('\n');

  return `${heading}\n${items}`;
}

function formatDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
