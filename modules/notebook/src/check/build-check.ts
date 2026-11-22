import type { LinkType, TargetKind } from '../types';

export interface CheckNote {
  readonly noteID: string;
  readonly shortID: string;
  readonly title: string;
  readonly editedAt: number;
  readonly isPrivate: boolean;
}

export interface CheckLink {
  readonly fromNoteID: string;
  readonly fromShortID: string;
  readonly type: LinkType;
  readonly kind: TargetKind;
  readonly targetID: string;

  // what a result shows for the target
  readonly targetShownID: string;
  readonly isGone: boolean;
  readonly reason: string | null;
  readonly createdAt: number;
}

export interface CheckOptions {
  readonly checkReasonRepeats: number;

  // false builds the check over every note, then leaves out each entry of a private note
  readonly isPrivateShown: boolean;
}

export interface NotebookCheck {
  readonly orphans: readonly { readonly note: string; readonly title: string }[];
  readonly dangling: readonly {
    readonly from: string;
    readonly to: Readonly<Record<string, string>>;
    readonly type: LinkType;
  }[];
  readonly repeatedReasons: readonly {
    readonly reason: string;
    readonly count: number;
    readonly links: readonly {
      readonly from: string;
      readonly to: Readonly<Record<string, string>>;
    }[];
  }[];
  readonly orphanCount: number;
  readonly danglingCount: number;
  readonly repeatedReasonCount: number;
}

const listLimit = 50;

// Two reasons are the same when they match after trimming, collapsing runs of spaces and ignoring
// case.
export function normalizeReason(reason: string): string {
  return reason.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
}

// The check over the active notes and their links. An orphan is active, holds no link, and no
// active note links to it. A link is dangling when its target is gone. A related reason is repeated
// when more links than the setting hold it. Each list holds at most 50 entries, oldest edit first.
export function buildCheck(
  notes: readonly CheckNote[],
  links: readonly CheckLink[],
  options: CheckOptions,
): NotebookCheck {
  const privateNotes = options.isPrivateShown ? [] : notes.filter((note) => note.isPrivate);

  const hidden = new Set(privateNotes.map((note) => note.noteID));

  const linked = new Set(
    links.flatMap((link) =>
      link.kind === 'note' ? [link.fromNoteID, link.targetID] : [link.fromNoteID],
    ),
  );

  const orphans = notes
    .filter((note) => !linked.has(note.noteID) && !hidden.has(note.noteID))
    .toSorted(byEdit)
    .map((note) => ({ note: note.shortID, title: note.title }));

  const editedAt = new Map(notes.map((note) => [note.noteID, note.editedAt]));

  const byLinkOrder = (first: CheckLink, second: CheckLink): number =>
    (editedAt.get(first.fromNoteID) ?? 0) - (editedAt.get(second.fromNoteID) ?? 0) ||
    first.createdAt - second.createdAt;

  const shown = links.filter((link) => !hidden.has(link.fromNoteID)).toSorted(byLinkOrder);

  const dangling = shown
    .filter((link) => link.isGone)
    .map((link) => ({
      from: link.fromShortID,
      to: { [link.kind]: link.targetShownID },
      type: link.type,
    }));

  const repeated = collectRepeatedReasons(links.toSorted(byLinkOrder), options.checkReasonRepeats)
    .map((group) => ({
      reason: group.reason,
      links: group.links.filter(
        (link) =>
          !hidden.has(link.fromNoteID) && !(link.kind === 'note' && hidden.has(link.targetID)),
      ),
    }))
    .filter((group) => group.links.length > 0)
    .map((group) => ({
      reason: group.reason,
      count: group.links.length,
      links: group.links.map((link) => ({
        from: link.fromShortID,
        to: { [link.kind]: link.targetShownID },
      })),
    }));

  return {
    orphans: orphans.slice(0, listLimit),
    dangling: dangling.slice(0, listLimit),
    repeatedReasons: repeated.slice(0, listLimit),
    orphanCount: orphans.length,
    danglingCount: dangling.length,
    repeatedReasonCount: repeated.length,
  };
}

function byEdit(first: CheckNote, second: CheckNote): number {
  return first.editedAt - second.editedAt || first.shortID.localeCompare(second.shortID);
}

function collectRepeatedReasons(links: readonly CheckLink[], threshold: number) {
  const groups = new Map<string, { reason: string; links: CheckLink[] }>();

  for (const link of links) {
    if (link.type !== 'related' || link.reason === null) {
      continue;
    }

    const key = normalizeReason(link.reason);
    const group = groups.get(key) ?? { reason: link.reason, links: [] };

    group.links.push(link);
    groups.set(key, group);
  }

  return [...groups.values()].filter((group) => group.links.length > threshold);
}
