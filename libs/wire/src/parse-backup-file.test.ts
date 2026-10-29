import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { backupReceiptSchema } from './backup-receipt';
import { backupSetManifestSchema } from './backup-set-manifest';
import { parseBackupFile } from './parse-backup-file';

// Each format's files stay as that format's release wrote them, so a release that drops a format
// the release before still writes fails here.
test('it reads the manifest of format 1, which the release before writes', async () => {
  const text = await Bun.file(
    join(import.meta.dir, '..', 'backup-formats', '1', 'manifest.json'),
  ).text();

  expect(parseBackupFile(text, backupSetManifestSchema)).toStrictEqual({ value: JSON.parse(text) });
});

test.each(['receipt-published.json', 'receipt-failed.json'])(
  'it reads the format 1 receipt %s, which the release before writes',
  async (file) => {
    const text = await Bun.file(join(import.meta.dir, '..', 'backup-formats', '1', file)).text();

    expect(parseBackupFile(text, backupReceiptSchema)).toStrictEqual({ value: JSON.parse(text) });
  },
);

test('it refuses text that is not JSON, naming the file', () => {
  expect(parseBackupFile('{"format": 1,', backupSetManifestSchema)).toStrictEqual({
    refused: 'the file: Invalid input: expected object, received null',
  });
});

test('it refuses a manifest of a format this release cannot read, naming the field', () => {
  const parsed = parseBackupFile(
    JSON.stringify({
      format: 2,
      kind: 'scheduled',
      sequence: 7,
      stagedAt: 1_798_761_600_000,
      copies: [
        { name: 'nixie.db', bytes: 4096, sha256: 'a'.repeat(64) },
        { name: 'keys.db', bytes: 4096, sha256: 'b'.repeat(64) },
      ],
    }),
    backupSetManifestSchema,
  );

  expect(parsed).toStrictEqual({ refused: 'format: Invalid input: expected 1' });
});
