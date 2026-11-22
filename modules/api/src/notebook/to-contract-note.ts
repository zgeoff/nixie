import type { ClientNote } from '@heynixie/notebook';

// The contract's times are dates, and the notebook's are epoch milliseconds or UTC text.
export function toContractNote(note: ClientNote) {
  return {
    note: note.note,
    version: note.version,
    versionCount: note.versionCount,
    title: note.title,
    tags: [...note.tags],
    isPrivate: note.isPrivate,
    body: note.body,
    links: note.links.map((link) => ({
      type: link.type,
      kind: link.kind,
      target: link.target,
      reason: link.reason,
      isGone: link.isGone,
      label: link.label,
      event: link.event === null ? null : { at: new Date(link.event.at), role: link.event.role },
    })),
    backlinks: note.backlinks.map((link) => ({ ...link })),
    history: note.history.map((entry) => ({ ...entry, at: new Date(entry.at) })),
    historyNext: note.historyNext,
    readAt: note.readAt === null ? null : new Date(note.readAt),
    ownerOpenedAt: note.ownerOpenedAt === null ? null : new Date(note.ownerOpenedAt),
  };
}
