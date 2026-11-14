// Stored as a string and read through this closed union, so a release that lacks a cause reads
// unknown.
export type RunEndCause =
  | 'reported'
  | 'limit'
  | 'stopped'
  | 'closed'
  | 'failed'
  | 'no_work'
  | 'no_report'
  | 'unknown';

const runEndCauses: readonly RunEndCause[] = [
  'reported',
  'limit',
  'stopped',
  'closed',
  'failed',
  'no_work',
  'no_report',
];

export function toRunEndCause(stored: string): RunEndCause {
  return runEndCauses.find((cause) => cause === stored) ?? 'unknown';
}
