/* oxlint-disable id-length -- the image pointer's field is n, as the number input of log.read_image names it */
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { memoryExportSchema } from './memory-export-schema';

test('it accepts the version 8 export file the fixture holds, a message with 2 images, a removed record and another gap included', async () => {
  const fixture: unknown = await Bun.file(
    join(import.meta.dir, 'fixtures', 'memory-export-v8.json'),
  ).json();

  const parsed: unknown = memoryExportSchema.safeParse(fixture).data;

  expect(parsed).toStrictEqual(fixture);
});

test('it reads a span record of the version 6 file the fixture holds as not removed', async () => {
  const fixture: unknown = await Bun.file(
    join(import.meta.dir, 'fixtures', 'memory-export-v6.json'),
  ).json();

  const file = memoryExportSchema.parse(fixture);

  const marks = file.moments.flatMap((moment) =>
    'records' in moment ? moment.records.map((record) => record.isRemoved) : [],
  );

  expect(marks).toStrictEqual([false, false, false, false]);
});

test('it rejects a version 6 span record that carries a removal mark', async () => {
  const text = await Bun.file(join(import.meta.dir, 'fixtures', 'memory-export-v6.json')).text();

  const fixture: unknown = JSON.parse(
    text.replace('"isGap": false', '"isGap": false, "isRemoved": false'),
  );

  const result = memoryExportSchema.safeParse(fixture);

  expect(result.error?.issues).toPartiallyContain({
    path: ['moments', 0, 'records', 0, 'isRemoved'],
  });
});

test('it rejects a version 7 span record with no removal mark', async () => {
  const text = await Bun.file(join(import.meta.dir, 'fixtures', 'memory-export-v7.json')).text();

  const fixture: unknown = JSON.parse(text.replace(/,\s*"isRemoved": false/u, ''));
  const result = memoryExportSchema.safeParse(fixture);

  expect(result.error?.issues).toPartiallyContain({
    path: ['moments', 0, 'records', 0, 'isRemoved'],
  });
});

test('it accepts the version 6 file the fixture holds', async () => {
  const fixture: unknown = await Bun.file(
    join(import.meta.dir, 'fixtures', 'memory-export-v6.json'),
  ).json();

  expect(memoryExportSchema.safeParse(fixture).success).toBeTrue();
});

test('it reads an item of a version 5 file, which predates the sensitive mark, as not sensitive', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 5,
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
        versions: [
          {
            version: 1,
            change: 'created',
            state: 'active',
            text: 'Keeps a spare key under the blue pot',
            evidenceQuote: null,
            until: null,
            provenance: {
              origin: 'owner',
              source: 'owner',
              taskID: null,
              proposalID: null,
              checks: null,
              writerModel: null,
              checkerModel: null,
              snapshotHash: 'sha256:4be1c0',
              recordedAt: '2026-10-12T09:00:00.000Z',
            },
          },
        ],
      },
      { itemID: 'e2f84d19-5a7c-4b0e-a3d6-9c1f8b2e4a65', forgottenAt: '2026-10-13T18:31:00.000Z' },
    ],
    moments: [],
  });

  expect(result.data?.items).toStrictEqual([
    {
      itemID: '0b7e3c52-6d1f-4a8e-9c2b-5f4d1e7a3b90',
      shortID: 'k3x9m2p7qa',
      state: 'active',
      isPinned: false,
      isSensitive: false,
      subject: 'owner',
      versions: [
        {
          version: 1,
          change: 'created',
          state: 'active',
          text: 'Keeps a spare key under the blue pot',
          evidenceQuote: null,
          until: null,
          provenance: {
            origin: 'owner',
            source: 'owner',
            taskID: null,
            proposalID: null,
            checks: null,
            writerModel: null,
            checkerModel: null,
            snapshotHash: 'sha256:4be1c0',
            recordedAt: '2026-10-12T09:00:00.000Z',
          },
        },
      ],
    },
    { itemID: 'e2f84d19-5a7c-4b0e-a3d6-9c1f8b2e4a65', forgottenAt: '2026-10-13T18:31:00.000Z' },
  ]);
});

test('it rejects a version 5 item that carries a sensitive mark', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 5,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      {
        itemID: '0b7e3c52-6d1f-4a8e-9c2b-5f4d1e7a3b90',
        shortID: 'k3x9m2p7qa',
        state: 'active',
        isPinned: false,
        isSensitive: true,
        subject: 'owner',
        versions: [
          {
            version: 1,
            change: 'created',
            state: 'active',
            text: 'Keeps a spare key under the blue pot',
            evidenceQuote: null,
            until: null,
            provenance: {
              origin: 'owner',
              source: 'owner',
              taskID: null,
              proposalID: null,
              checks: null,
              writerModel: null,
              checkerModel: null,
              snapshotHash: 'sha256:4be1c0',
              recordedAt: '2026-10-12T09:00:00.000Z',
            },
          },
        ],
      },
    ],
    moments: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['items', 0, 'isSensitive'] });
});

test('it rejects a version 6 item with no sensitive mark', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 6,
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
        versions: [
          {
            version: 1,
            change: 'created',
            state: 'active',
            text: 'Keeps a spare key under the blue pot',
            evidenceQuote: null,
            until: null,
            provenance: {
              origin: 'owner',
              source: 'owner',
              taskID: null,
              proposalID: null,
              checks: null,
              writerModel: null,
              checkerModel: null,
              snapshotHash: 'sha256:4be1c0',
              recordedAt: '2026-10-12T09:00:00.000Z',
            },
          },
        ],
      },
    ],
    moments: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['items', 0, 'isSensitive'] });
});

test('it rejects a forgotten item that carries more than its ID and time', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 6,
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

  expect(result.error?.issues).toPartiallyContain({ path: ['items', 0] });
});

test('it rejects a file of another schema version', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 1,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      { itemID: 'e2f84d19-5a7c-4b0e-a3d6-9c1f8b2e4a65', forgottenAt: '2026-10-13T18:31:00.000Z' },
    ],
    moments: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['header', 'schemaVersion'] });
});

test('it rejects a readable item with no version', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 6,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      {
        itemID: '0b7e3c52-6d1f-4a8e-9c2b-5f4d1e7a3b90',
        shortID: 'k3x9m2p7qa',
        state: 'active',
        isPinned: false,
        isSensitive: false,
        subject: 'owner',
        versions: [],
      },
    ],
    moments: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['items', 0, 'versions'] });
});

test('it rejects a readable item with no kind', () => {
  const result = memoryExportSchema.safeParse({
    header: {
      schemaVersion: 6,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [
      {
        itemID: '0b7e3c52-6d1f-4a8e-9c2b-5f4d1e7a3b90',
        shortID: 'k3x9m2p7qa',
        state: 'active',
        isPinned: false,
        isSensitive: false,
        versions: [
          {
            version: 1,
            change: 'created',
            state: 'active',
            text: 'Keeps a spare key under the blue pot',
            evidenceQuote: null,
            until: null,
            provenance: {
              origin: 'owner',
              source: 'owner',
              taskID: null,
              proposalID: null,
              checks: null,
              writerModel: null,
              checkerModel: null,
              snapshotHash: 'sha256:4be1c0',
              recordedAt: '2026-10-12T09:00:00.000Z',
            },
          },
        ],
      },
    ],
    moments: [],
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['items', 0] });
});

test.each([6, 7])(
  'it reads the span records of a version %i file with no images',
  async (version) => {
    const fixture: unknown = await Bun.file(
      join(import.meta.dir, 'fixtures', `memory-export-v${version}.json`),
    ).json();

    const file = memoryExportSchema.parse(fixture);

    const lists = file.moments.flatMap((moment) =>
      'records' in moment ? moment.records.map((record) => record.images) : [],
    );

    expect(lists).toSatisfyAll((images) => images.length === 0);
  },
);

test('it reads the span records of a version 5 file with no images', () => {
  const file = memoryExportSchema.parse({
    header: {
      schemaVersion: 5,
      exportedAt: '2026-10-14T08:00:00.000Z',
      snapshotHash: 'sha256:4be1c0',
    },
    items: [],
    moments: [
      {
        momentID: '4d1e7a3b-90c2-4b5f-8a6d-1e9c3f7b2d40',
        shortID: 'm4q8r2t6vb',
        state: 'active',
        thread: 'thread-1',
        firstSequence: 3,
        lastSequence: 3,
        keptBy: 'owner',
        keptThread: null,
        keptModel: null,
        keptAt: '2026-10-12T09:05:00.000Z',
        editedAt: null,
        title: 'Shelf photo',
        note: null,
        reflections: [],
        links: [],
        records: [
          {
            sequence: 3,
            kind: 'owner_message',
            recordedAt: '2026-10-12T09:00:00.000Z',
            source: 'owner',
            payload: null,
            decision: null,
            text: 'a shelf',
            isGap: false,
          },
        ],
      },
    ],
  });

  expect(
    file.moments.flatMap((moment) => ('records' in moment ? moment.records : [])),
  ).toSatisfyAll((record) => record.images.length === 0);
});

test('it rejects a version 7 span record that carries an image list', async () => {
  const text = await Bun.file(join(import.meta.dir, 'fixtures', 'memory-export-v7.json')).text();

  const fixture: unknown = JSON.parse(
    text.replace('"isGap": false', '"isGap": false, "images": []'),
  );

  const result = memoryExportSchema.safeParse(fixture);

  expect(result.error?.issues).toPartiallyContain({
    path: ['moments', 0, 'records', 0, 'images'],
  });
});

test('it rejects a version 8 span record with no image list', async () => {
  const text = await Bun.file(join(import.meta.dir, 'fixtures', 'memory-export-v8.json')).text();

  const fixture: unknown = JSON.parse(text.replace(/,\s*"images": \[\]/u, ''));
  const result = memoryExportSchema.safeParse(fixture);

  expect(result.error?.issues).toPartiallyContain({
    path: ['moments', 0, 'records', 1, 'images'],
  });
});
