import { expect, test } from 'bun:test';
import type { z } from 'zod';
import type { SecretsEntryName } from './secrets-entry-names';
import type { SameNames } from './secrets-entry-names-match';
import { secretsEntryNamesMatch } from './secrets-entry-names-match';
import type { secretsSchema } from './secrets-schema';

type SecretsKey = keyof z.infer<typeof secretsSchema>;

test('it holds that the config entry names are the keys of the secrets file', () => {
  expect(secretsEntryNamesMatch).toBe(true);
});

test('it fails the type check when the config accepts a name that the secrets file lacks', () => {
  // @ts-expect-error the check resolves to never for a union with one extra name
  const widened: SameNames<SecretsEntryName | 'extra_entry', SecretsKey> = true;

  expect(Boolean(widened)).toBe(true);
});

test('it fails the type check when the secrets file holds a name that the config lacks', () => {
  // @ts-expect-error the check resolves to never for a union with one name fewer
  const narrowed: SameNames<Exclude<SecretsEntryName, 'settings'>, SecretsKey> = true;

  expect(Boolean(narrowed)).toBe(true);
});
