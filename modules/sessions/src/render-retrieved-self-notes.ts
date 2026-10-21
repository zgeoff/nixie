import { formatMemoryDay } from './format-memory-day';
import type { MemoryItem, MemoryLineOptions } from './types';

type SelfNote = Pick<MemoryItem, 'shortID' | 'version' | 'recordedAt' | 'model' | 'text'>;

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

function renderSelfNoteLine(note: SelfNote, options: MemoryLineOptions): string {
  const parts = [
    `${note.shortID} v${note.version}`,
    formatMemoryDay(note.recordedAt, options),
    'you wrote this',
    note.model,
  ];

  return parts.filter((part) => part !== null).join(' · ');
}
