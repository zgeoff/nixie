import type { MemoryItem, MemoryLineOptions } from '../types';
import { renderItemQuote } from './render-item-quote';
import { renderMemoryLine } from './render-memory-line';

export function renderMemoryItem(
  item: Pick<
    MemoryItem,
    | 'shortID'
    | 'revision'
    | 'recordedAt'
    | 'origin'
    | 'source'
    | 'approval'
    | 'text'
    | 'evidenceQuote'
    | 'isBridge'
  >,
  options: MemoryLineOptions,
): readonly string[] {
  return [
    `- ${item.text}`,
    `  ${renderMemoryLine({ ...item, shownVersion: item.revision }, options)}`,
    ...renderItemQuote(item),
  ];
}
