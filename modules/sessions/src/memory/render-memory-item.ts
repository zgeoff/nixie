import { mintBlockID } from '@heynixie/wire';
import type { MemoryItem, MemoryLineOptions } from '../types';
import { renderItemQuote } from './render-item-quote';
import { renderMemoryLine } from './render-memory-line';
import { renderMemoryText } from './render-memory-text';

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
  mint: () => string = mintBlockID,
): readonly string[] {
  return [
    renderMemoryText(item, mint),
    `  ${renderMemoryLine({ ...item, shownVersion: item.revision }, options)}`,
    ...renderItemQuote(item),
  ];
}
