import type { Log } from '@heynixie/log';
import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';

// The reader code.run takes a note file from: the note's current body, or null for a note that is
// unknown, being forgotten or forgotten. It reads the tables and the log alone, so the code run
// part can hold it before the notebook starts.
export function buildNoteBodies(log: Pick<Log, 'deploymentKey' | 'writer'>): {
  readonly readBody: (shortID: string) => Promise<string | null>;
} {
  return {
    readBody: async (shortID) => {
      const row = await readActiveNoteRow(log.writer.db, shortID);

      if (row === null) {
        return null;
      }

      const text = await readNoteText(log, row.text_seq);

      return text?.body ?? null;
    },
  };
}
