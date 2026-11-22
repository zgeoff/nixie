import { countCodePoints } from '@heynixie/tools';
import type { BodyChange } from './apply-changes';
import { applyChanges } from './apply-changes';
import { mergeTags } from './merge-tags';
import type { NoteRefusal } from './note-refusal';
import { buildRefusal } from './note-refusal';

export interface EditInput {
  readonly version?: number;
  readonly body?: string;
  readonly changes?: readonly BodyChange[];
  readonly append?: string;
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly isPrivate?: boolean;
}

export interface CurrentNote {
  readonly shortID: string;
  readonly version: number;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly isPrivate: boolean;
}

export type EditPlan =
  | { readonly kind: 'refused'; readonly refusal: NoteRefusal }
  | {
      readonly kind: 'edit';
      readonly title: string;
      readonly body: string;
      readonly tags: readonly string[];
      readonly isPrivate: boolean;
    };

// Checks the refusals of notebook.edit after UNKNOWN_NOTE, in the design's order, then builds the
// whole new version. An edit that sets only append binds to the current version, and any other edit
// binds to the version it read.
export function planEdit(current: CurrentNote, input: EditInput, noteChars: number): EditPlan {
  const refusal = pickEditRefusal(current, input);

  if (refusal !== null) {
    return { kind: 'refused', refusal };
  }

  let body = input.body ?? current.body;

  if (input.changes !== undefined) {
    const applied = applyChanges(body, input.changes);

    if (applied.kind === 'no_match') {
      return {
        kind: 'refused',
        refusal: buildRefusal(
          'NO_MATCH',
          `change ${String(applied.index)} of note ${current.shortID} matches nowhere in the body; nothing was changed`,
        ),
      };
    }

    if (applied.kind === 'many_matches') {
      return {
        kind: 'refused',
        refusal: buildRefusal(
          'MANY_MATCHES',
          `change ${String(applied.index)} of note ${current.shortID} matches ${String(applied.count)} times; add context to find, or set all; nothing was changed`,
        ),
      };
    }

    body = applied.body;
  }

  if (input.append !== undefined) {
    body = `${body}${input.append}`;
  }

  const chars = countCodePoints(body);

  if (chars > noteChars) {
    return {
      kind: 'refused',
      refusal: buildRefusal(
        'NOTE_TOO_LONG',
        `the body of note ${current.shortID} would be ${String(chars)} characters, past the limit of ${String(noteChars)}; continue in a new note linked part-of`,
      ),
    };
  }

  return {
    kind: 'edit',
    title: input.title ?? current.title,
    body,
    tags: input.tags === undefined ? current.tags : mergeTags(input.tags),
    isPrivate: input.isPrivate ?? current.isPrivate,
  };
}

function pickEditRefusal(current: CurrentNote, input: EditInput): NoteRefusal | null {
  const setsAppend = input.append !== undefined;

  const setsOther =
    input.body !== undefined ||
    input.changes !== undefined ||
    input.title !== undefined ||
    input.tags !== undefined ||
    input.isPrivate !== undefined;

  if (!setsAppend && !setsOther) {
    return buildRefusal('NOTHING_TO_CHANGE', `the edit of note ${current.shortID} sets no field`);
  }

  if (input.body !== undefined && (input.changes !== undefined || setsAppend)) {
    return buildRefusal(
      'BODY_AND_CHANGES',
      `the edit of note ${current.shortID} sets body beside changes or append; pass a whole new body, or changes and append`,
    );
  }

  if (input.version === undefined && setsOther) {
    return buildRefusal(
      'VERSION_REQUIRED',
      `the edit of note ${current.shortID} needs the version you read; only an append alone may leave it out`,
    );
  }

  if (input.version !== undefined && input.version !== current.version) {
    return buildRefusal(
      'STALE_VERSION',
      `note ${current.shortID} is at version ${String(current.version)}, not ${String(input.version)}; read it again with notebook.read`,
      { currentVersion: current.version },
    );
  }

  return null;
}
