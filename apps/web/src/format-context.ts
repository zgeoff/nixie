import type { ContextActivity } from './build-activity';
import { formatTokenCount } from './format-token-count';

// Formats how full the context stands against its window, such as "41k / 400k".
export function formatContext(context: ContextActivity): string {
  return `${formatTokenCount(context.size)} / ${formatTokenCount(context.window)}`;
}
