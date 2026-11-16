import { z } from 'zod';

// What the CLI says about a failed turn: the class it names, and the HTTP status the model API
// answered with, when it has one.
export interface ErrorInfo {
  readonly name: string;
  readonly status: number | null;
}

const statusSchema = z.object({ httpStatusCode: z.number().int().nullable() });
const keyedInfoSchema = z.record(z.string(), statusSchema);

// The CLI names the class as a string, or as the one key of an object that holds the status.
export function parseErrorInfo(info: unknown): ErrorInfo | null {
  if (typeof info === 'string') {
    return { name: info, status: null };
  }

  const keyed = keyedInfoSchema.safeParse(info);
  const entries = keyed.success ? Object.entries(keyed.data) : [];
  const [entry] = entries;

  return entry === undefined ? null : { name: entry[0], status: entry[1].httpStatusCode };
}
