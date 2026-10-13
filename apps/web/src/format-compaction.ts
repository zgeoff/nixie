import type { CompactionActivity } from './build-activity';
import { formatTokenCount } from './format-token-count';

// Formats a compaction with what started it and its tokens before and after, such as
// "compacted (auto) · 384k → 42k tokens", or the before count alone when the session reported no
// after count.
export function formatCompaction(compaction: CompactionActivity): string {
  const tokens =
    compaction.postTokens === undefined
      ? `${formatTokenCount(compaction.preTokens)} tokens before`
      : `${formatTokenCount(compaction.preTokens)} → ${formatTokenCount(compaction.postTokens)} tokens`;

  return `compacted (${compaction.trigger}) · ${tokens}`;
}
