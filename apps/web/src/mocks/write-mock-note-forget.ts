import { mockViewStore } from './mock-view-store';

interface NoteForgetInput {
  readonly clientActionID: string;
  readonly note: string;
  readonly version: number;
}

type NoteForgetResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: Date }
  | { readonly status: 'not_found' }
  | { readonly status: 'stale' }
  | { readonly status: 'reused' };

export async function writeMockNoteForget(input: NoteForgetInput): Promise<NoteForgetResult> {
  const earlier = mockViewStore.noteForgets.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.note === input.note
      ? { status: 'forgotten', forgottenAt: earlier.forgottenAt }
      : { status: 'reused' };
  }

  const target = mockViewStore.notes.findFirst((query) =>
    query.where((row) => row.note === input.note),
  );

  if (target === undefined || target.isForgotten) {
    return { status: 'not_found' };
  }

  if (target.versions.length !== input.version) {
    return { status: 'stale' };
  }

  const forgottenAt = new Date();

  await mockViewStore.notes.update(target, {
    data(draft) {
      draft.isForgotten = true;
      draft.versions = [];
      draft.links = [];
    },
  });

  await mockViewStore.noteForgets.create({
    clientActionID: input.clientActionID,
    note: input.note,
    version: input.version,
    forgottenAt,
  });

  return { status: 'forgotten', forgottenAt };
}
