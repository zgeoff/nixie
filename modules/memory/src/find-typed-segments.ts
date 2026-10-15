import type { TextRange } from './find-quoted-blocks';
import { findQuotedBlocks } from './find-quoted-blocks';
import type { OwnerMessage } from './gate-types';

// Finds the runs of a message that you typed outside every quoted block, in order, as text. Typed
// spans that touch join into one run, so a token typed across 2 spans stays whole.
export function findTypedSegments(message: OwnerMessage): readonly string[] {
  const blocks = findQuotedBlocks(message.text);
  const runs: TextRange[] = [];

  for (const span of message.spans.filter((candidate) => candidate.source === 'typed')) {
    const last = runs.at(-1);

    if (last !== undefined && span.start <= last.end) {
      runs[runs.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    } else {
      runs.push({ start: span.start, end: span.end });
    }
  }

  return runs.flatMap((run) => splitRun(message.text, run, blocks));
}

function splitRun(text: string, run: TextRange, blocks: readonly TextRange[]): readonly string[] {
  const segments: string[] = [];
  let at = run.start;

  for (const block of blocks.filter((candidate) => candidate.start < run.end)) {
    if (block.start > at) {
      segments.push(text.slice(at, block.start));
    }

    at = Math.max(at, block.end);
  }

  if (at < run.end) {
    segments.push(text.slice(at, run.end));
  }

  return segments;
}
