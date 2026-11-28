import { z } from 'zod';

// The number a record holds in place of no limit. The release before this one reads a record's
// limit as a number, so a record of a task run with no limit holds a limit that no task run reaches.
const unlimitedStoredLimit = 1_000_000_000;

// A limit as the log stores it is a number, and in memory it is null when the task run has no limit
// on that meter. Parse a stored limit to read it, and encode a limit to store it.
export function buildLimitSchema(stored: z.ZodNumber) {
  return z.codec(stored, stored.nullable(), {
    decode: (value) => (value === unlimitedStoredLimit ? null : value),
    encode: (value) => value ?? unlimitedStoredLimit,
  });
}
