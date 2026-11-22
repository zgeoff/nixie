import { mockViewStore } from './mock-view-store';

interface NoteOpenInput {
  readonly clientActionID: string;
  readonly note: string;
  readonly version?: number | undefined;
}

type NoteOpenResult =
  | {
      readonly status: 'opened';
      readonly body: string;
      readonly previousBody: string | null;
      readonly ownerOpenedAt: Date;
    }
  | { readonly status: 'unknown' }
  | { readonly status: 'not_private' }
  | { readonly status: 'reused' }
  | { readonly status: 'failed' };

// The checked open of a private note: one notebook.private_opened mark for each action ID, so a
// retry of the same ID answers the first opening and never moves the mark.
export async function writeMockNoteOpen(input: NoteOpenInput): Promise<NoteOpenResult> {
  mockViewStore.noteOpenCalls.clientActionIDs.push(input.clientActionID);

  if (mockViewStore.noteOpenCalls.failuresLeft > 0) {
    mockViewStore.noteOpenCalls.failuresLeft -= 1;

    return { status: 'failed' };
  }

  const row = mockViewStore.notes.findFirst((query) =>
    query.where((entry) => entry.note === input.note),
  );

  if (row === undefined || row.isForgotten || row.versions.length === 0) {
    return { status: 'unknown' };
  }

  const earlier = mockViewStore.noteOpens.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined && earlier.note !== input.note) {
    return { status: 'reused' };
  }

  if (!row.isPrivate) {
    return { status: 'not_private' };
  }

  const version = earlier?.version ?? input.version ?? row.versions.length;
  const openedAt = earlier?.openedAt ?? new Date();

  if (earlier === undefined) {
    await mockViewStore.noteOpens.create({
      clientActionID: input.clientActionID,
      note: input.note,
      openedAt,
      version,
    });

    await mockViewStore.notes.update(row, {
      data(draft) {
        draft.ownerOpenedAt = openedAt;
      },
    });
  }

  return {
    status: 'opened',
    body: row.versions[version - 1]?.body ?? '',
    previousBody: row.versions[version - 2]?.body ?? null,
    ownerOpenedAt: openedAt,
  };
}
