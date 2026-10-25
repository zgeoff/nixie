// Reads the plain JSONL that an export of a deployment's data directory writes: records.jsonl,
// memory-items.jsonl, memory-versions.jsonl and rating-notes.jsonl. The files hold the owner's own
// data, so they stay on the owner's machine and never enter the repo.
import { join } from 'node:path';
import { z } from 'zod';
import { readJSONLines } from './read-json-lines.ts';

export const plainRecordSchema = z.object({
  sequence: z.int(),
  recordedAt: z.string(),
  kind: z.string(),
  thread: z.string().nullable(),
  parent: z.int().nullable(),
  payload: z.record(z.string(), z.unknown()),
  erasable: z.discriminatedUnion('status', [
    z.object({ status: z.enum(['none', 'shredded', 'unreadable']) }),
    z.object({ status: z.literal('readable'), fields: z.record(z.string(), z.unknown()) }),
  ]),
});

export type PlainRecord = z.infer<typeof plainRecordSchema>;

const plainItemSchema = z.object({
  item_id: z.string(),
  version: z.int(),
  state: z.string(),
  is_pinned: z.int(),
  pinned_sequence: z.int().nullable(),
  created_sequence: z.int(),
  short_id: z.string().nullable(),
  kind: z.enum(['fact', 'self']),
  subject: z.string().nullable(),
});

const plainVersionSchema = z.object({
  item_id: z.string(),
  version: z.int(),
  change: z.string(),
  state: z.string(),
  sequence: z.int(),
  until: z.number().nullable(),
  status: z.string(),
  text: z.string().exactOptional(),
});

export type PlainVersion = z.infer<typeof plainVersionSchema>;

const plainNoteSchema = z.object({
  sequence: z.int(),
  itemID: z.string(),
  status: z.string(),
  text: z.string().exactOptional(),
});

export interface PlainExport {
  records: PlainRecord[];
  items: z.infer<typeof plainItemSchema>[];
  versions: PlainVersion[];
  notes: z.infer<typeof plainNoteSchema>[];
}

export async function readPlainExport(dir: string): Promise<PlainExport> {
  const [records, items, versions, notes] = await Promise.all([
    readJSONLines(join(dir, 'records.jsonl'), plainRecordSchema),
    readJSONLines(join(dir, 'memory-items.jsonl'), plainItemSchema),
    readJSONLines(join(dir, 'memory-versions.jsonl'), plainVersionSchema),
    readJSONLines(join(dir, 'rating-notes.jsonl'), plainNoteSchema),
  ]);

  return { records, items, versions, notes };
}

export function readErasableText(record: PlainRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const text = record.erasable.fields['text'];

  return typeof text === 'string' ? text : null;
}
