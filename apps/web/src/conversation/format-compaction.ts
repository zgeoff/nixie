import type { CompactionActivity } from './build-activity';
import { formatTokenCount } from './format-token-count';

export function formatCompaction(compaction: CompactionActivity): string {
  const tokens =
    compaction.postTokens === undefined
      ? `${formatTokenCount(compaction.preTokens)} tokens before`
      : `${formatTokenCount(compaction.preTokens)} → ${formatTokenCount(compaction.postTokens)} tokens`;

  return `compacted (${compaction.trigger}) · ${tokens}`;
}
