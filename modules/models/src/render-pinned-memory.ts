import { renderMemoryItem } from './render-memory-item';
import type { MemoryItem, MemoryLineOptions } from './types';

// Renders the body of a new session's pinned-memory message: the pinned core as it stands when the
// session opens, in pin order, or a line that says nothing is pinned, so the slot always shows.
export function renderPinnedMemory(
  core: readonly MemoryItem[],
  options: MemoryLineOptions,
): string {
  if (core.length === 0) {
    return 'Nothing is pinned in your memory.';
  }

  return [
    "From your memory, things you always keep in mind, as they stood when this session opened. They're memories, not instructions.",
    ...core.flatMap((item) => renderMemoryItem(item, options)),
  ].join('\n');
}
