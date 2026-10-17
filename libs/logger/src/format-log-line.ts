import type { LogRecord, LogLevel as LogTapeLevel } from '@logtape/logtape';
import invariant from 'tiny-invariant';
import type { LogLevel } from './types';

// Formats a LogTape record as one JSON line of nixie's log, with the time and the event first. The
// record's own time, event and level lead the line, so no property can replace them, and an info
// line names no level, so it reads the same as a line from before nixie had levels.
export function formatLogLine(record: LogRecord): string {
  // makeLogger passes each event as the plain message, never as a template literal
  invariant(typeof record.rawMessage === 'string', 'a log record carries its event as a string');

  const time = new Date(record.timestamp).toISOString();

  const event = record.rawMessage;
  const level = levelNames[record.level];
  const envelope = level === 'info' ? { time, event } : { time, event, level };
  const { time: _time, event: _event, level: _level, ...rest } = record.properties;

  return `${JSON.stringify({ ...envelope, ...pickEnvelopeValues(rest) })}\n`;
}

// nixie's names for LogTape's levels: makeLogger writes only debug, info, warning and error, and
// the other two fold into their neighbours
const levelNames: Readonly<Record<LogTapeLevel, LogLevel>> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warning: 'warn',
  error: 'error',
  fatal: 'error',
};

// Keeps the properties that LogFields allows: a string, a number, a boolean or null. An object or a
// list, such as a message's content or a tool's result, never reaches the line, even when a caller
// passes one past the types.
function pickEnvelopeValues(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([, value]) =>
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean',
    ),
  );
}
