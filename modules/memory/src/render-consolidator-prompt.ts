import type { RecalledItem } from './types';

export interface ConsolidatorPromptInput {
  readonly items: readonly RecalledItem[];

  readonly isComplete: boolean;
}

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
