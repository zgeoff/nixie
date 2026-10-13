import type { MemoryOrigin } from './types';

// One item that changed outside the conversation, as the note lists it.
export interface NotedChange {
  readonly itemID: string;
  readonly change: 'remembered' | 'changed' | 'retired';
  readonly text: string;
}

// A write outside the conversation that proposed the same change as one of the conversation's
// pending proposals, and merged into it.
export interface NotedMerge {
  readonly proposalID: string;
  readonly origin: MemoryOrigin;
}

export interface MemoryChangeNote {
  // the changes the note lists, already cut to its cap
  readonly changes: readonly NotedChange[];

  // the merges into the conversation's own proposals
  readonly merges: readonly NotedMerge[];

  // how many more items changed past the cap
  readonly moreCount: number;

  // how many items the catch-up took in, which the note counts and never lists
  readonly catchUpCount: number;
}

// Renders the note before your message on the conversation's next turn: outside changes up to the
// cap, then how many more, then each of its proposals that another source proposed again. The
// catch-up's items appear as a count only. It renders nothing when nothing changed.
export function renderMemoryChangeNote(note: MemoryChangeNote): string | null {
  if (
    note.changes.length === 0 &&
    note.moreCount === 0 &&
    note.catchUpCount === 0 &&
    note.merges.length === 0
  ) {
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
    ...note.merges.map((merge) => renderMerge(merge)),
    '</memory-changes>',
  ].join('\n');
}

function renderChange(change: NotedChange): string {
  const label = { remembered: 'Remembered', changed: 'Changed', retired: 'Retired' }[change.change];

  return `- ${label} [${change.itemID}]: ${change.text}`;
}

function renderMerge(merge: NotedMerge): string {
  return `- ${originLabels[merge.origin]} proposed the same memory again; it merged into your pending proposal [${merge.proposalID}], which still waits for the owner's review`;
}

const originLabels: Readonly<Record<MemoryOrigin, string>> = {
  owner: 'The owner',
  conversation: 'Another conversation turn',
  task: 'A task',
  memory_writer: 'The memory writer',
};
