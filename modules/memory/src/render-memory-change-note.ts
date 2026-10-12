// One item that changed outside the conversation, as the note lists it.
export interface NotedChange {
  readonly itemID: string;
  readonly change: 'remembered' | 'changed' | 'retired';
  readonly text: string;
}

export interface MemoryChangeNote {
  // the changes the note lists, already cut to its cap
  readonly changes: readonly NotedChange[];

  // how many more items changed past the cap
  readonly moreCount: number;

  // how many items the catch-up took in, which the note counts and never lists
  readonly catchUpCount: number;
}

// Renders the note that goes before your message on the conversation's next turn: the memory
// changes the conversation did not make itself, up to the cap, then how many more. The catch-up's
// items appear as a count only. It renders nothing when nothing changed.
export function renderMemoryChangeNote(note: MemoryChangeNote): string | null {
  if (note.changes.length === 0 && note.moreCount === 0 && note.catchUpCount === 0) {
    return null;
  }
  const listed = note.changes.map((change) => renderChange(change));
  const more = note.moreCount;

  return [
    '<memory-changes>',
    'Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.',
    ...(note.catchUpCount === 0
      ? []
      : [
          `- Took in ${String(note.catchUpCount)} ${note.catchUpCount === 1 ? 'thing' : 'things'} from earlier conversation`,
        ]),
    ...listed,
    ...(more > 0 ? [`and ${String(more)} more`] : []),
    '</memory-changes>',
  ].join('\n');
}

function renderChange(change: NotedChange): string {
  const label = { remembered: 'Remembered', changed: 'Changed', retired: 'Retired' }[change.change];

  return `- ${label} [${change.itemID}]: ${change.text}`;
}
