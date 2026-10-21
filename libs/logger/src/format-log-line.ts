import type { LogRecord, LogLevel as LogTapeLevel } from '@logtape/logtape';
import invariant from 'tiny-invariant';
import type { LogLevel } from './types';

const levelNames: Readonly<Record<LogTapeLevel, LogLevel>> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warning: 'warn',
  error: 'error',
  fatal: 'error',
};

export function formatLogLine(record: LogRecord): string {
  invariant(typeof record.rawMessage === 'string', 'a log record carries its event as a string');

  const time = new Date(record.timestamp).toISOString();

  const event = record.rawMessage;
  const level = levelNames[record.level];
  const envelope = level === 'info' ? { time, event } : { time, event, level };
  const { time: _time, event: _event, level: _level, ...rest } = record.properties;

  return `${JSON.stringify({ ...envelope, ...pickEnvelopeValues(rest) })}\n`;
}

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
