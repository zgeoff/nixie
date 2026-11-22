import type { MemoryItem, MemoryLineOptions } from '../types';
import { renderItemQuote } from './render-item-quote';
import { renderLinkCounts } from './render-link-counts';
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
    | 'disputedBy'
    | 'supersededBy'
  >,
  options: MemoryLineOptions,
): readonly string[] {
  return [
    [`- ${item.text}`, renderLinkCounts(item)].filter((part) => part !== null).join(' '),
    `  ${renderMemoryLine({ ...item, shownVersion: item.revision }, options)}`,
    ...renderItemQuote(item),
  ];
}
