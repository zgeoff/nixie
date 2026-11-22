// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { match } from 'ts-pattern';
import { readForgetBackupState } from '../forget/read-forget-backup-state';
import { requireCaller } from '../memory/require-caller';
import type { APIContext, ForgetProgress, ViewNotebookStore } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { readClientAction } from '../utils/read-client-action';
import { writeMemoryChange } from '../utils/write-memory-change';
import { NoteRefusedError } from './note-refused-error';
import { toContractNote } from './to-contract-note';
import { toNotebookError } from './to-notebook-error';

export function createNotebookProcedures(context: APIContext) {
  const notebook = apiImplementer.notebook;

  const requireNotebook = (buildNotStarted: () => Error): ViewNotebookStore => {
    const store = context.readNotebook?.() ?? null;

    if (store === null) {
      throw buildNotStarted();
    }

    return store;
  };

  return {
    listNotes: notebook.listNotes.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireNotebook(options.errors.NOTEBOOK_NOT_STARTED);
      const input = options.input;

      const list = await store.listNotes({
        isPrivateShown: input.showPrivate ?? false,
        ...(input.query === undefined ? {} : { query: input.query }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        ...(input.after === undefined ? {} : { after: input.after }),
      });

      return {
        notes: list.notes.map((entry) => ({
          note: entry.note,
          title: entry.title,
          tags: [...entry.tags],
          version: entry.version,
          updatedAt: new Date(entry.updatedAt),
          backlinkCount: entry.backlinkCount,
          isPrivate: entry.isPrivate,
          match: entry.match,
        })),
        next: list.next,
        isMeaningPartial: list.isMeaningPartial,
      };
    }),

    readNote: notebook.readNote.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireNotebook(options.errors.NOTEBOOK_NOT_STARTED);
      const input = options.input;

      const read = await store.readClientNote({
        note: input.note,
        isPrivateShown: input.showPrivate ?? false,
        ...(input.version === undefined ? {} : { version: input.version }),
        ...(input.historyAfter === undefined ? {} : { historyAfter: input.historyAfter }),
      });

      return match(read)
        .with({ status: 'unknown' }, () => {
          throw options.errors.UNKNOWN_NOTE();
        })
        .with({ status: 'hidden' }, (hidden) => ({ note: hidden.note, isPrivate: true as const }))
        .with({ status: 'read' }, (found) => toContractNote(found.note))
        .exhaustive();
    }),

    openPrivate: notebook.openPrivate.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const store = requireNotebook(options.errors.NOTEBOOK_NOT_STARTED);
      const input = options.input;

      const outcome = await writeMemoryChange(context, caller, {
        clientActionID: input.clientActionID,
        procedure: 'notebook.openPrivate',
        input: { note: input.note, version: input.version ?? null },
        result: { note: input.note },
        apply: async (writeInTransaction) => {
          const opened = await store.writeOpened(input.note, writeInTransaction);

          if (opened.status === 'refused') {
            throw new NoteRefusedError(opened.reason);
          }
        },
      }).catch((error: unknown) => {
        throw toNotebookError(error, options.errors);
      });

      match(outcome)
        .with('unauthorized', () => {
          throw options.errors.UNAUTHORIZED();
        })
        .with('reused', () => {
          throw options.errors.CLIENT_ACTION_ID_REUSED();
        })
        .with('applied', () => {})
        .exhaustive();

      // The checked action keeps no body, so a retry reads the bodies again.
      const bodies = await store.readPrivateBodies({
        note: input.note,
        ...(input.version === undefined ? {} : { version: input.version }),
      });

      if (bodies.status === 'refused') {
        throw toNotebookError(new NoteRefusedError(bodies.reason), options.errors);
      }

      return {
        body: bodies.body,
        previousBody: bodies.previousBody,
        ownerOpenedAt: bodies.ownerOpenedAt === null ? null : new Date(bodies.ownerOpenedAt),
      };
    }),

    readCheck: notebook.readCheck.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireNotebook(options.errors.NOTEBOOK_NOT_STARTED);

      const check = await store.readClientCheck(options.input.showPrivate ?? false);

      return {
        orphans: check.orphans.map((orphan) => ({ ...orphan })),
        dangling: check.dangling.map((link) => ({ ...link, to: { ...link.to } })),
        repeatedReasons: check.repeatedReasons.map((repeated) => ({
          reason: repeated.reason,
          count: repeated.count,
          links: repeated.links.map((link) => ({ from: link.from, to: { ...link.to } })),
        })),
        orphanCount: check.orphanCount,
        danglingCount: check.danglingCount,
        repeatedReasonCount: check.repeatedReasonCount,
      };
    }),

    previewForget: notebook.previewForget.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireNotebook(options.errors.NOTEBOOK_NOT_STARTED);

      const read = await store.readForgetPreview(options.input.note);

      if (read.status === 'unknown') {
        throw options.errors.UNKNOWN_NOTE();
      }

      const preview = read.preview;

      return {
        version: preview.version,
        title: preview.title,
        versionCount: preview.versionCount,
        linkCount: preview.linkCount,
        backlinkCount: preview.backlinkCount,
      };
    }),

    forget: notebook.forget.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const store = requireNotebook(options.errors.NOTEBOOK_NOT_STARTED);
      const target = { note: options.input.note, version: options.input.version };
      const forgottenAt = context.clock.now();

      const outcome = await writeMemoryChange(context, caller, {
        clientActionID: options.input.clientActionID,
        procedure: 'notebook.forget',
        input: target,
        result: { note: target.note, forgottenAt },
        apply: async (writeInTransaction) => {
          const forgotten = await store.forget(target, writeInTransaction);

          if (forgotten.status === 'refused') {
            throw new NoteRefusedError(forgotten.reason);
          }
        },
      }).catch((error: unknown) => {
        throw toNotebookError(error, options.errors);
      });

      await match(outcome)
        .with('unauthorized', () => {
          throw options.errors.UNAUTHORIZED();
        })
        .with('reused', () => {
          throw options.errors.CLIENT_ACTION_ID_REUSED();
        })
        .with('applied', () => store.finishForget(target.note))
        .exhaustive();

      const action = await readClientAction(context.log.writer.db, options.input.clientActionID);
      const sequence = await store.readForgottenSequence(target.note);

      const progress: ForgetProgress =
        sequence === null ? { stage: 'deleting' } : { stage: 'forgotten', sequence };

      return {
        forgottenAt: new Date(Number(action?.result['forgottenAt'] ?? forgottenAt)),
        backup: await readForgetBackupState(context, progress),
      };
    }),
  };
}
