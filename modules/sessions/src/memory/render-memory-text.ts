import { mintBlockID, renderFenced } from '@heynixie/wire';
import type { MemoryItem } from '../types';
import { renderLinkCounts } from './render-link-counts';

// An item's text is whatever the model or an outside page once said, so it sits in a fence of its
// own that the text cannot close. The dispute counts follow the closing tag.
export function renderMemoryText(
  item: Pick<MemoryItem, 'text' | 'disputedBy' | 'supersededBy'>,
  mint: () => string = mintBlockID,
): string {
  const fenced = renderFenced({
    tag: 'memory-text',
    attributes: {},
    text: item.text,
    fence: mint(),
  });

  return [`- ${fenced}`, renderLinkCounts(item)].filter((part) => part !== null).join(' ');
}
