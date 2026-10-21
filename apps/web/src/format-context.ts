import type { ContextActivity } from './build-activity';
import { formatTokenCount } from './format-token-count';

export function formatContext(context: ContextActivity): string {
  return `${formatTokenCount(context.size)} / ${formatTokenCount(context.window)}`;
}
