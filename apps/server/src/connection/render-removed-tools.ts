import { connectionStatusText } from './connection-status-text';
import { fillStatusText } from './fill-status-text';

const shownToolCount = 5;

// The tools that a status removed, by name up to 5 with a count of the rest, or nothing when it
// removed none.
export function renderRemovedTools(tools: readonly string[]): string {
  if (tools.length === 0) {
    return '';
  }

  const shown = tools.slice(0, shownToolCount).join(', ');
  const rest = tools.length - shownToolCount;

  return rest > 0
    ? fillStatusText(connectionStatusText.removedToolsMore, { tools: shown, count: String(rest) })
    : fillStatusText(connectionStatusText.removedTools, { tools: shown });
}
