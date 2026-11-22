import { mockViewStore } from './mock-view-store';
import { store } from './store';

type MockNoteRow = ReturnType<typeof mockViewStore.notes.all>[number];

// The links of a note with each target's title or gist. With showPrivate off, a link to a private
// note is left out, with no placeholder.
export function readMockNoteLinks(row: MockNoteRow, showPrivate: boolean) {
  return row.links.flatMap((link) => {
    const target = readTarget(link);

    if (target.isPrivate && !showPrivate) {
      return [];
    }

    return [
      {
        type: link.type,
        kind: link.kind,
        target: link.target,
        reason: link.reason,
        isGone: target.label === null,
        label: target.label,
        event: target.event,
      },
    ];
  });
}

interface MockTarget {
  readonly label: string | null;
  readonly isPrivate: boolean;
  readonly event: { readonly at: Date; readonly role: string } | null;
}

type MockNoteLink = MockNoteRow['links'][number];

function readTarget(link: MockNoteLink): MockTarget {
  if (link.kind === 'note') {
    const note = mockViewStore.notes.findFirst((query) =>
      query.where((row) => row.note === link.target && !row.isForgotten),
    );

    return {
      label: note?.versions.at(-1)?.title ?? null,
      isPrivate: note?.isPrivate === true,
      event: null,
    };
  }

  if (link.kind === 'memory') {
    const item = store.memoryItems.findFirst((query) =>
      query.where((entry) => entry.shortID === link.target && entry.state !== 'forgotten'),
    );

    return { label: item?.versions.at(-1)?.text ?? null, isPrivate: false, event: null };
  }

  if (link.kind === 'moment') {
    const moment = store.moments.findFirst((query) =>
      query.where((entry) => entry.shortID === link.target && entry.state !== 'destroyed'),
    );

    return { label: moment?.title ?? null, isPrivate: false, event: null };
  }

  const record = store.records.findFirst((query) =>
    query.where((entry) => String(entry.sequence) === link.target && entry.isRemoved !== true),
  );

  if (record === undefined) {
    return { label: null, isPrivate: false, event: null };
  }

  return {
    label: record.message?.text ?? '',
    isPrivate: false,
    event: { at: record.recordedAt, role: record.kind === 'owner_message' ? 'owner' : 'assistant' },
  };
}
