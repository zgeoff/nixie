import type { Logger } from './types';

// Makes the logger that writes one JSON line per event, with the time first. A line holds the
// event and its envelope fields only, such as IDs, kinds and outcomes, because a line that copied
// a message or a tool's result would keep it after its key is gone.
export function makeLogger(
  writeLine: (line: string) => void,
  now: () => number = Date.now,
): Logger {
  return (event, fields = {}, level = 'info') => {
    const time = new Date(now()).toISOString();

    // an info line names no level, so it reads the same as a line from before nixie had levels
    const envelope = level === 'info' ? { time, event } : { time, event, level };

    // the level is the call's alone, so a field named level never reaches the line
    const { level: _fieldLevel, ...rest } = fields;

    // the time and the event lead the line, and no field can replace them
    writeLine(`${JSON.stringify({ ...envelope, ...rest, ...envelope })}\n`);
  };
}
