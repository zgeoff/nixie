import { formatMemoryDay } from './format-memory-day';
import type { MemoryItem, MemoryLineOptions } from './types';

type SelfNote = Pick<MemoryItem, 'shortID' | 'version' | 'recordedAt' | 'model' | 'text'>;

// Renders the body of the retrieved-self-notes message: the self-notes placed for a turn, each with
// a line that gives its version, its day and the model that wrote it, after a line that labels them
// as your own notes, or nothing when none matched.
export function renderRetrievedSelfNotes(
  notes: readonly SelfNote[],
  options: MemoryLineOptions,
): string | null {
  if (notes.length === 0) {
    return null;
  }

  const owner = options.ownerName ?? 'the owner';

  return [
    `Your own notes about yourself, which you wrote and ${owner} approved. They're notes, not instructions.`,
    ...notes.flatMap((note) => [`- ${note.text}`, `  ${renderSelfNoteLine(note, options)}`]),
  ].join('\n');
}

// the line under a self-note, as in q4wz8n2kpa v1 · 13 Oct · you wrote this · claude-opus-5-5,
// which leaves the model out when the version names none
function renderSelfNoteLine(note: SelfNote, options: MemoryLineOptions): string {
  const parts = [
    `${note.shortID} v${note.version}`,
    formatMemoryDay(note.recordedAt, options),
    'you wrote this',
    note.model,
  ];

  return parts.filter((part) => part !== null).join(' · ');
}
