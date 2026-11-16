import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { memoryExportSchema } from './memory-export-schema';

function setupTest() {
  return {
    readFixtureText: () =>
      Bun.file(join(import.meta.dir, '..', '..', 'fixtures', 'memory-export-v11.json')).text(),
    readEarlierFixtureText: () =>
      Bun.file(join(import.meta.dir, '..', '..', 'fixtures', 'memory-export-v10.json')).text(),
  };
}

test('it accepts the version 11 export file the fixture holds, a removed version and a bridge version included', async () => {
  const ctx = setupTest();

  const text = await ctx.readFixtureText();

  const fixture: unknown = JSON.parse(text);
  const parsed: unknown = memoryExportSchema.safeParse(fixture).data;

  expect(parsed).toStrictEqual(fixture);
});

test('it reads a version 10 file with every version and label entry marked neither removed nor a bridge', async () => {
  const ctx = setupTest();

  const text = await ctx.readEarlierFixtureText();

  const parsed = memoryExportSchema.safeParse(JSON.parse(text)).data;
  const readable = parsed?.items.filter((item) => 'versions' in item) ?? [];

  expect(parsed?.header.schemaVersion).toBe(10);

  expect(readable.flatMap((item) => item.versions)).toSatisfyAll(
    (version) => version.isRemoved === false && version.isBridge === false,
  );

  expect(readable.flatMap((item) => item.labelHistory)).toSatisfyAll(
    (entry) => entry.isBridge === false,
  );
});

test('it rejects a version 11 version with no removed mark', async () => {
  const ctx = setupTest();

  const text = await ctx.readFixtureText();

  const fixture: unknown = JSON.parse(text.replace(/"isRemoved": (?:true|false),\s*/u, ''));
  const result = memoryExportSchema.safeParse(fixture);

  expect(result.success).toBe(false);
});

test('it rejects a version 10 version that holds the version 11 marks', async () => {
  const ctx = setupTest();

  const text = await ctx.readFixtureText();

  const fixture: unknown = JSON.parse(text.replace('"schemaVersion": 11', '"schemaVersion": 10'));
  const result = memoryExportSchema.safeParse(fixture);

  expect(result.success).toBe(false);
});

test('it rejects a version 11 item with no labels', async () => {
  const ctx = setupTest();

  const text = await ctx.readFixtureText();

  const fixture: unknown = JSON.parse(text.replace(/"labels": \{[^}]*\},\s*/u, ''));
  const result = memoryExportSchema.safeParse(fixture);

  expect(result.success).toBe(false);
});

test('it rejects a version 11 span record with no image list', async () => {
  const ctx = setupTest();

  const text = await ctx.readFixtureText();

  const fixture: unknown = JSON.parse(text.replace(/,\s*"images": \[\]/u, ''));
  const result = memoryExportSchema.safeParse(fixture);

  expect(result.success).toBe(false);
});

test('it rejects a file of version 9', async () => {
  const ctx = setupTest();

  const text = await ctx.readFixtureText();

  const fixture: unknown = JSON.parse(text.replace('"schemaVersion": 11', '"schemaVersion": 9'));
  const result = memoryExportSchema.safeParse(fixture);

  expect(result.success).toBe(false);
});

test('it rejects a forgotten item that carries more than its ID and time', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 11,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      {
        itemID: 'e2f84d19-5a7c-4b0e-a3d6-9c1f8b2e4a65',
        forgottenAt: '2026-10-13T18:31:00.000Z',
        text: 'Keeps a spare key under the blue pot',
      },
    ],
    moments: [],
  });

  expect(result.success).toBe(false);
});

test('it rejects a readable item with no version', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 11,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      {
        itemID: '0b7e3c52-6d1f-4a8e-9c2b-5f4d1e7a3b90',
        shortID: 'k3x9m2p7qa',
        state: 'active',
        isPinned: false,
        subject: 'owner',
        versions: [],
        labels: null,
        labelHistory: [],
      },
    ],
    moments: [],
  });

  expect(result.success).toBe(false);
});
