import { configure, reset } from '@logtape/logtape';
import { formatLogLine } from './format-log-line';

export interface LineLog {
  readonly stop: () => Promise<void>;
}

export async function startLineLog(writeLine: (line: string) => void): Promise<LineLog> {
  await configure({
    sinks: {
      // A synchronous sink writes each line before the log call returns, so a line lands in order
      // with what the process prints and never waits in a LogTape buffer at exit.
      lines: (record) => {
        writeLine(formatLogLine(record));
      },
    },
    loggers: [
      { category: ['nixie'], sinks: ['lines'], lowestLevel: 'debug' },
      { category: ['logtape', 'meta'], sinks: [] },
    ],
  });

  return { stop: reset };
}
