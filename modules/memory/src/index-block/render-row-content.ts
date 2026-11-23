import type { TopicLine, TopicRow } from './collect-topic-rows';
import { foldedLines } from './constants';
import { flattenText } from './flatten-text';
import type { RowState } from './types';

// What follows a topic's label: all of its items, or its count and 3 items once folded. A topic
// with sub-topics shows the items filed under it, then each sub-topic open or folded on its own.
export function renderRowContent(state: RowState): string {
  const row = state.row;

  if (state.isFolded) {
    return renderFolded(row);
  }

  return row.subTopics.length === 0 ? renderLines(row.lines) : renderSegments(state);
}

function renderFolded(row: TopicRow): string {
  const subTopics = row.subTopics
    .map((sub) => `${flattenText(sub.name)} ${String(sub.count)}`)
    .join(', ');

  return [
    'folded',
    renderFoldedItems(row.lines, row),
    ...(subTopics === '' ? [] : [`sub-topics: ${subTopics}`]),
  ].join(' · ');
}

// The 3 items a folded row shows, in the topic's folded order.
function renderFoldedItems(lines: readonly TopicLine[], row: TopicRow): string {
  const picked =
    row.foldOrder === 'oldest'
      ? lines.slice(-foldedLines).toReversed()
      : lines.slice(0, foldedLines);

  return `${row.foldOrder}: ${renderLines(picked)}`;
}

function renderLines(lines: readonly TopicLine[]): string {
  return lines.map((line) => `[${line.shortID}] ${flattenText(line.gist)}`).join(' · ');
}

function renderSegments(state: RowState): string {
  const row = state.row;
  const direct = renderLines(row.directLines);

  const subs = row.subTopics.map((sub) => {
    const label = `${flattenText(sub.name)} (${String(sub.count)})`;

    return state.foldedSubs.includes(sub.name)
      ? `${label} folded · ${renderFoldedItems(sub.lines, row)}`
      : `${label}: ${renderLines(sub.lines)}`;
  });

  return [...(direct === '' ? [] : [direct]), ...subs].join(' | ');
}
