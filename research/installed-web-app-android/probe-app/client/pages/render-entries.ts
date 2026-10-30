import type { LogEntry } from '../../src/contract.ts';

// Renders log entries of the given kinds, newest first, into a list, or one line that says why
// there is nothing to show.
export function renderEntries(
  list: HTMLElement,
  entries: LogEntry[] | string,
  kinds: LogEntry['kind'][],
): void {
  const lines =
    typeof entries === 'string'
      ? [entries]
      : entries
          .filter((entry) => kinds.includes(entry.kind))
          .map(
            (entry) =>
              `${entry.at} ${entry.session ?? 'no session'} ${entry.kind}\n${JSON.stringify(entry.detail, null, 1)}`,
          );

  list.replaceChildren(
    ...(lines.length === 0 ? ['nothing recorded yet'] : lines).map((line) => {
      const item = document.createElement('li');

      item.textContent = line;

      return item;
    }),
  );
}
