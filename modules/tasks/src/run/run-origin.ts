// Stored as a string and read through this closed union, so a release that lacks an origin reads
// unknown.
export type RunOrigin =
  | 'start'
  | 'trigger'
  | 'message'
  | 'owner'
  | 'timer'
  | 'event'
  | 'raise'
  | 'restart'
  | 'unknown';

const runOrigins: readonly RunOrigin[] = [
  'start',
  'trigger',
  'message',
  'owner',
  'timer',
  'event',
  'raise',
  'restart',
];

export function toRunOrigin(stored: string): RunOrigin {
  return runOrigins.find((origin) => origin === stored) ?? 'unknown';
}
