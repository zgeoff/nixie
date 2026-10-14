import { renderItemQuote } from './render-item-quote';
import { renderMemoryLine } from './render-memory-line';
import type { MemoryItem, MemoryLineOptions } from './types';

// Renders one memory item as the system prompt and the retrieved block hold it: its text, the line
// that says where it came from, and the quote it came up in. The pinned core's budget counts these
// lines.
export function renderMemoryItem(
  item: Pick<
    MemoryItem,
    | 'shortID'
    | 'version'
    | 'recordedAt'
    | 'origin'
    | 'source'
    | 'approval'
    | 'text'
    | 'evidenceQuote'
  >,
  options: MemoryLineOptions,
): readonly string[] {
  return [`- ${item.text}`, `  ${renderMemoryLine(item, options)}`, ...renderItemQuote(item)];
}
