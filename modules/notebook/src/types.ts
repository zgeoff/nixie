import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';
import type { CleanupSessions } from '@heynixie/memory';
import type { Selectable } from 'kysely';

export const linkTypes = ['supersedes', 'disputes', 'part-of', 'cites', 'related'] as const;

export type LinkType = (typeof linkTypes)[number];

export type TargetKind = 'note' | 'memory' | 'moment' | 'event';

// A note, a memory item and a moment take a short ID or a UUID, and an event takes the decimal ID
// that log.read shows.
export type LinkTarget =
  | { readonly note: string }
  | { readonly memory: string }
  | { readonly moment: string }
  | { readonly event: string };

export type NoteState = 'active' | 'forgetting' | 'forgotten';

interface NotebookNoteTable {
  readonly note_id: string;
  readonly short_id: string;
  readonly state: NoteState;
  readonly version: number;
  readonly text_seq: number;
  readonly is_private: number;
  readonly created_at: number;
  readonly edited_at: number;
  readonly read_at: number | null;
  readonly owner_opened_at: number | null;
}

interface NotebookVersionTable {
  readonly note_id: string;
  readonly version: number;
  readonly seq: number;
  readonly writer: string;
  readonly model: string;
  readonly chars: number;
  readonly created_at: number;
}

interface NotebookLinkTable {
  readonly link_key: string;
  readonly from_note_id: string;
  readonly target_kind: TargetKind;
  readonly target_id: string;
  readonly type: LinkType;
  readonly reason_seq: number | null;
  readonly created_at: number;
}

interface MemoryItemView {
  readonly item_id: string;
  readonly short_id: string | null;
  readonly state: string;
}

interface MomentView {
  readonly moment_id: string;
  readonly short_id: string;
  readonly state: string;
}

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
export type NotebookTables = CheckedTables<
  Readonly<{
    notebook_notes: NotebookNoteTable;
    notebook_versions: NotebookVersionTable;
    notebook_links: NotebookLinkTable;
    memory_items: MemoryItemView;
    moments: MomentView;
  }>,
  'memory_items' | 'moments'
>;

export type NoteRow = Selectable<NotebookNoteTable>;

export type LinkRow = Selectable<NotebookLinkTable>;

export interface NotebookSettings {
  // the most characters of one body
  readonly noteChars: number;

  // active notes; a write past it is NOTEBOOK_FULL
  readonly maxNotes: number;

  // a related reason on more links than this is repeated
  readonly checkReasonRepeats: number;
}

export const defaultNotebookSettings: NotebookSettings = {
  noteChars: 50_000,
  maxNotes: 1000,
  checkReasonRepeats: 3,
};

// What the notebook reads of memory: the IDs and the gists. Memory owns the answers.
export interface NotebookMemory {
  // each ID, short or UUID, mapped to the item's UUID
  readonly readItemIDMap: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;

  // null when the item holds no readable gist
  readonly readGist: (itemID: string) => Promise<string | null>;
}

export interface NotebookContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly clock: Pick<Clock, 'now'>;
  readonly settings: NotebookSettings;
  readonly memory: NotebookMemory;

  // Runs the session cleanup of a forget: it must be safe to run again, because a forget that a
  // crash cut short runs it again.
  readonly cleanupSessions: CleanupSessions;
}

// Who writes: the conversation, or the task whose run called the tool. The server sets both from
// the turn, never from a tool's input.
export interface NoteWriter {
  readonly writer: string;
  readonly model: string;
}
