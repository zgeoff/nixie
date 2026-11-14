import type { SecretsEntryName } from '@heynixie/connectors';
import type { z } from 'zod';
import type { secretsSchema } from './secrets-schema';

// Resolves to true when the two unions hold the same names, and to never when either holds a name
// the other lacks.
export type SameNames<Left extends string, Right extends string> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : never
  : never;

// The names that `secret_own_values` accepts must be the keys of the secrets file, so a new entry
// fails the type check until the config accepts it.
export const secretsEntryNamesMatch: SameNames<
  SecretsEntryName,
  keyof z.infer<typeof secretsSchema>
> = true;
