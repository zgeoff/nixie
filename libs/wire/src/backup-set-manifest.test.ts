import { expect, test } from 'bun:test';
import { backupSetManifestSchema } from './backup-set-manifest';

test('it accepts a set with one copy of each database', () => {
  const payload = {
    format: 1,
    kind: 'scheduled',
    sequence: 7,
    stagedAt: 1_798_761_600_000,
    copies: [
      { name: 'nixie.db', bytes: 4096, sha256: 'a'.repeat(64) },
      { name: 'keys.db', bytes: 4096, sha256: 'b'.repeat(64) },
    ],
  } as const;

  expect(backupSetManifestSchema.safeParse(payload).data).toStrictEqual(payload);
});

test('it refuses a set that holds nixie.db twice and no keys.db', () => {
  const result = backupSetManifestSchema.safeParse({
    format: 1,
    kind: 'scheduled',
    sequence: 7,
    stagedAt: 1_798_761_600_000,
    copies: [
      { name: 'nixie.db', bytes: 4096, sha256: 'a'.repeat(64) },
      { name: 'nixie.db', bytes: 4096, sha256: 'b'.repeat(64) },
    ],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['copies'] });
});

test('it refuses a checksum that is not a lowercase SHA-256', () => {
  const result = backupSetManifestSchema.safeParse({
    format: 1,
    kind: 'scheduled',
    sequence: 7,
    stagedAt: 1_798_761_600_000,
    copies: [
      { name: 'nixie.db', bytes: 4096, sha256: 'A'.repeat(64) },
      { name: 'keys.db', bytes: 4096, sha256: 'b'.repeat(64) },
    ],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['copies', 0, 'sha256'] });
});

test('it refuses a kind that nixie never stages', () => {
  const result = backupSetManifestSchema.safeParse({
    format: 1,
    kind: 'manual',
    sequence: 7,
    stagedAt: 1_798_761_600_000,
    copies: [
      { name: 'nixie.db', bytes: 4096, sha256: 'a'.repeat(64) },
      { name: 'keys.db', bytes: 4096, sha256: 'b'.repeat(64) },
    ],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['kind'] });
});
