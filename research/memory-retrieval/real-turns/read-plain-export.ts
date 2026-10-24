// Reads the plain JSONL that an export of a deployment's data directory writes: records.jsonl,
// memory-items.jsonl, memory-versions.jsonl and rating-notes.jsonl. The files hold the owner's own
// data, so they stay on the owner's machine and never enter the repo.
import { join } from 'node:path';

export interface PlainRecord {
  sequence: number;
  recordedAt: string;
  kind: string;
  thread: string | null;
  parent: number | null;
  payload: Record<string, unknown>;
  erasable:
    | { status: 'none' | 'shredded' | 'unreadable' }
    | { status: 'readable'; fields: Record<string, unknown> };
}

export interface PlainItem {
  item_id: string;
  version: number;
  state: string;
  is_pinned: number;
  pinned_sequence: number | null;
  created_sequence: number;
  short_id: string | null;
  kind: 'fact' | 'self';
  subject: string | null;
}

export interface PlainVersion {
  item_id: string;
  version: number;
  change: string;
  state: string;
  sequence: number;
  until: number | null;
  status: string;
  text?: string;
}

export interface PlainNote {
  sequence: number;
  itemID: string;
  status: string;
  text?: string;
}

export interface PlainExport {
  records: PlainRecord[];
  items: PlainItem[];
  versions: PlainVersion[];
  notes: PlainNote[];
}

export async function readPlainExport(dir: string): Promise<PlainExport> {
  const [records, items, versions, notes] = await Promise.all([
    readLines<PlainRecord>(join(dir, 'records.jsonl')),
    readLines<PlainItem>(join(dir, 'memory-items.jsonl')),
    readLines<PlainVersion>(join(dir, 'memory-versions.jsonl')),
    readLines<PlainNote>(join(dir, 'rating-notes.jsonl')),
  ]);

  return { records, items, versions, notes };
}

async function readLines<T>(path: string): Promise<T[]> {
  const text = await Bun.file(path).text();

  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): T => JSON.parse(line));
}

export function readErasableText(record: PlainRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const text = record.erasable.fields['text'];

  return typeof text === 'string' ? text : null;
}
