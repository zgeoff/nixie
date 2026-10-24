import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readErasableText, readPlainExport } from './read-plain-export.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'plain-export-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads the four files of a plain export', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'records.jsonl'),
    '{"sequence":1,"recordedAt":"2026-03-02T09:00:00Z","kind":"owner_message","thread":"conversation","parent":null,"payload":{},"erasable":{"status":"readable","fields":{"text":"hello"}}}\n',
  );
  await writeFile(
    join(ctx.dir, 'memory-items.jsonl'),
    '{"item_id":"item-a","version":1,"state":"active","is_pinned":0,"pinned_sequence":null,"created_sequence":1,"short_id":"M1","kind":"fact","subject":"owner"}\n',
  );
  await writeFile(
    join(ctx.dir, 'memory-versions.jsonl'),
    '{"item_id":"item-a","version":1,"change":"created","state":"active","sequence":1,"until":null,"status":"readable","text":"Likes tea"}\n',
  );
  await writeFile(join(ctx.dir, 'rating-notes.jsonl'), '');

  expect(await readPlainExport(ctx.dir)).toStrictEqual({
    records: [
      {
        sequence: 1,
        recordedAt: '2026-03-02T09:00:00Z',
        kind: 'owner_message',
        thread: 'conversation',
        parent: null,
        payload: {},
        erasable: { status: 'readable', fields: { text: 'hello' } },
      },
    ],
    items: [
      {
        item_id: 'item-a',
        version: 1,
        state: 'active',
        is_pinned: 0,
        pinned_sequence: null,
        created_sequence: 1,
        short_id: 'M1',
        kind: 'fact',
        subject: 'owner',
      },
    ],
    versions: [
      {
        item_id: 'item-a',
        version: 1,
        change: 'created',
        state: 'active',
        sequence: 1,
        until: null,
        status: 'readable',
        text: 'Likes tea',
      },
    ],
    notes: [],
  });
});

test('it rejects an item whose kind is unknown', async () => {
  const ctx = await setupTest();
  const items = join(ctx.dir, 'memory-items.jsonl');

  await writeFile(join(ctx.dir, 'records.jsonl'), '');
  await writeFile(
    items,
    '{"item_id":"item-a","version":1,"state":"active","is_pinned":0,"pinned_sequence":null,"created_sequence":1,"short_id":"M1","kind":"note","subject":"owner"}\n',
  );
  await writeFile(join(ctx.dir, 'memory-versions.jsonl'), '');
  await writeFile(join(ctx.dir, 'rating-notes.jsonl'), '');

  expect(readPlainExport(ctx.dir)).rejects.toThrow(`${items}:1 does not match its schema at kind`);
});

test('#readErasableText reads no text from a shredded record', () => {
  expect(
    readErasableText({
      sequence: 1,
      recordedAt: '2026-03-02T09:00:00Z',
      kind: 'owner_message',
      thread: 'conversation',
      parent: null,
      payload: {},
      erasable: { status: 'shredded' },
    }),
  ).toBeNull();
});
