import type { Logger } from './types';

// Makes the logger that writes one JSON line per event, with the time first. A line holds the
// event and its envelope fields only, such as IDs, kinds and outcomes, because a line that copied
// a message or a tool's result would keep it after its key is gone.
export function makeLogger(
  writeLine: (line: string) => void,
  now: () => number = Date.now,
): Logger {
  return (event, fields = {}) => {
    const envelope = { time: new Date(now()).toISOString(), event };

    // the time and the event lead the line, and no field can replace them
    writeLine(`${JSON.stringify({ ...envelope, ...fields, ...envelope })}\n`);
  };
}
