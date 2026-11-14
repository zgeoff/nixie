import type { MemoryItem, MemoryLineOptions } from '../types';
import { renderItemQuote } from './render-item-quote';
import { renderMemoryLine } from './render-memory-line';

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
