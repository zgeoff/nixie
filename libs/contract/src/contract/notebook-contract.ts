import { z } from 'zod';
import { forgetBackupSchema } from './forget-backup-schema';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const notebookView = signedIn.errors({
  NOTEBOOK_NOT_STARTED: { message: 'The notebook has not started yet', status: 503 },
});

const noteView = notebookView.errors({
  UNKNOWN_NOTE: { message: 'No note has this ID', status: 404 },
});

const noteIDSchema = z.string().min(1).max(200);
const linkTypeSchema = z.enum(['supersedes', 'disputes', 'part-of', 'cites', 'related']);

const noteSummarySchema = z.object({
  note: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  version: z.int().positive(),
  updatedAt: z.date(),
  backlinkCount: z.int().nonnegative(),
  isPrivate: z.boolean(),
  match: z.string().nullable(),
});

const listSchema = z.object({
  query: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  showPrivate: z.boolean().optional(),
  after: z.string().max(200).optional(),
});

const linkSchema = z.object({
  type: linkTypeSchema,
  kind: z.enum(['note', 'memory', 'moment', 'event']),
  target: z.string(),
  reason: z.string().nullable(),
  isGone: z.boolean(),

  // the target's title or gist, or the start of an event's text
  label: z.string().nullable(),
  event: z.object({ at: z.date(), role: z.string() }).nullable(),
});

const backlinkSchema = z.object({
  type: linkTypeSchema,
  from: z.string(),
  title: z.string(),
});

const historyEntrySchema = z.object({
  version: z.int().positive(),
  at: z.date(),
  writer: z.string(),
  model: z.string(),
  chars: z.int().nonnegative(),
});

const readInputSchema = z.object({
  note: noteIDSchema,
  version: z.int().positive().optional(),
  showPrivate: z.boolean().optional(),
  historyAfter: z.string().max(200).optional(),
});

const noteSchema = z.object({
  note: z.string(),
  version: z.int().positive(),
  versionCount: z.int().positive(),
  title: z.string(),
  tags: z.array(z.string()),
  isPrivate: z.boolean(),

  // null for a private note, which only the checked open returns
  body: z.string().nullable(),
  links: z.array(linkSchema),
  backlinks: z.array(backlinkSchema),
  history: z.array(historyEntrySchema),
  historyNext: z.string().nullable(),
  readAt: z.date().nullable(),
  ownerOpenedAt: z.date().nullable(),
});

// A private note with showPrivate off answers its ID alone.
const hiddenNoteSchema = z.strictObject({ note: z.string(), isPrivate: z.literal(true) });
const targetSchema = z.object({ note: noteIDSchema, version: z.int().positive() });
const checkTargetSchema = z.record(z.string(), z.string());
const checkOrphanSchema = z.object({ note: z.string(), title: z.string() });

const checkDanglingSchema = z.object({
  from: z.string(),
  to: checkTargetSchema,
  type: linkTypeSchema,
});

const checkReasonLinkSchema = z.object({ from: z.string(), to: checkTargetSchema });

const checkRepeatedSchema = z.object({
  reason: z.string(),
  count: z.int().positive(),
  links: z.array(checkReasonLinkSchema),
});

const checkSchema = z.object({
  orphans: z.array(checkOrphanSchema),
  dangling: z.array(checkDanglingSchema),
  repeatedReasons: z.array(checkRepeatedSchema),
  orphanCount: z.int().nonnegative(),
  danglingCount: z.int().nonnegative(),
  repeatedReasonCount: z.int().nonnegative(),
});

export const notebookContract = {
  listNotes: notebookView.input(listSchema).output(
    z.object({
      notes: z.array(noteSummarySchema),
      next: z.string().nullable(),
      isMeaningPartial: z.boolean(),
    }),
  ),

  readNote: noteView.input(readInputSchema).output(z.union([noteSchema, hiddenNoteSchema])),

  // appends the one notebook.private_opened record
  openPrivate: noteView
    .errors(reusedIDErrors)
    .errors({ NOT_PRIVATE: { message: 'The note is not private', status: 409 } })
    .input(
      z.object({
        clientActionID: z.uuid(),
        note: noteIDSchema,
        version: z.int().positive().optional(),
      }),
    )
    .output(
      z.object({
        body: z.string(),
        previousBody: z.string().nullable(),
        ownerOpenedAt: z.date().nullable(),
      }),
    ),

  readCheck: notebookView
    .input(z.object({ showPrivate: z.boolean().optional() }))
    .output(checkSchema),

  previewForget: noteView.input(z.object({ note: noteIDSchema })).output(
    z.object({
      version: z.int().positive(),
      title: z.string(),
      versionCount: z.int().positive(),
      linkCount: z.int().nonnegative(),
      backlinkCount: z.int().nonnegative(),
    }),
  ),

  forget: noteView
    .errors(reusedIDErrors)
    .errors({ STALE_VERSION: { message: 'The note has moved past that version', status: 409 } })
    .input(targetSchema.extend({ clientActionID: z.uuid() }))
    .output(z.object({ forgottenAt: z.date(), backup: forgetBackupSchema })),
};
