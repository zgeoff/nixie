import type { LogFields } from './types';

export function toErrorFields(error: unknown): LogFields {
  return error instanceof Error
    ? { error: error.name, message: error.message }
    : { error: typeof error, message: null };
}
