import type { SummaryActivity } from './build-activity';
import { formatTokenCount } from './format-token-count';

export function formatSummary(summary: SummaryActivity): string {
  const tokens =
    summary.contextSize === undefined
      ? `${formatTokenCount(summary.summaryTokens)}-token summary`
      : `${formatTokenCount(summary.contextSize)} → ${formatTokenCount(summary.summaryTokens)} tokens`;

  return `summarized (${summary.trigger}) · ${tokens}`;
}
