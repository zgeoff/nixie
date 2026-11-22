import { z } from 'zod';
import type { NotebookSettings } from '../types';
import { defaultNotebookSettings } from '../types';

export type NotebookConfig = NotebookSettings;

export const notebookConfigSchema = z
  .strictObject({
    // the most characters of one body
    note_chars: z.int().positive().default(defaultNotebookSettings.noteChars),

    // active notes; a write past it is NOTEBOOK_FULL
    max_notes: z.int().positive().default(defaultNotebookSettings.maxNotes),

    // a related reason on more links than this is repeated
    check_reason_repeats: z.int().positive().default(defaultNotebookSettings.checkReasonRepeats),
  })
  .transform((config): NotebookConfig => ({
    noteChars: config.note_chars,
    maxNotes: config.max_notes,
    checkReasonRepeats: config.check_reason_repeats,
  }));
