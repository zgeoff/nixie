import { readCodeFile, readCodeFileEntry } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { MailFileReader } from '@heynixie/mail';

// The reader of the code files that the mail module sends, over the log that stores them.
export function buildMailFileReader(log: Pick<Log, 'deploymentKey' | 'writer'>): MailFileReader {
  return {
    readEntry: async (fileID) => {
      const entry = await readCodeFileEntry(log, fileID);

      return entry.kind === 'ok'
        ? { kind: 'ok', row: entry.row, name: entry.name, isStream: entry.isStream }
        : entry;
    },
    readFile: (thread, fileID) => readCodeFile(log, { thread, fileID }),
  };
}
