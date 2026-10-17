import { configure, reset } from '@logtape/logtape';
import { formatLogLine } from './format-log-line';

// The process's LogTape configuration, which stop takes down.
export interface LineLog {
  readonly stop: () => Promise<void>;
}

// Configures LogTape for the process, once, so that each makeLogger event goes to writeLine as one
// JSON line before the call returns: it lands in order with what the process prints, and no line
// waits in a buffer at exit. LogTape's own diagnostics write nowhere.
export async function startLineLog(writeLine: (line: string) => void): Promise<LineLog> {
  await configure({
    sinks: {
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
