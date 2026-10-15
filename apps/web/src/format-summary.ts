import type { SummaryActivity } from './build-activity';
import { formatTokenCount } from './format-token-count';

// Formats a summary that closed the session with what asked for it and its sizes, such as
// "summarized (threshold) · 165k → 1.2k tokens", or the summary's size alone when the session
// reported no context before it.
export function formatSummary(summary: SummaryActivity): string {
  const tokens =
    summary.contextSize === undefined
      ? `${formatTokenCount(summary.summaryTokens)}-token summary`
      : `${formatTokenCount(summary.contextSize)} → ${formatTokenCount(summary.summaryTokens)} tokens`;

  return `summarized (${summary.trigger}) · ${tokens}`;
}
