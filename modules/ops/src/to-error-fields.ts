import type { LogFields } from './types';

// The envelope of an error for a log line: its name and nixie's own message. A step error's message
// never reaches the log, because the tasks module records it on the task's thread instead.
export function toErrorFields(error: unknown): LogFields {
  return error instanceof Error
    ? { error: error.name, message: error.message }
    : { error: typeof error, message: null };
}
