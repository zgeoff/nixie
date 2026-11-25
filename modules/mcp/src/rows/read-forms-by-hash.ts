import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { parseToolForm } from '../pin/parse-tool-form';
import type { ToolForm } from '../types';
import type { McpTables } from './mcp-tables';

export type FormStatus = 'none' | 'readable' | 'unreadable';

export interface FoundForm {
  readonly status: FormStatus;
  readonly form: ToolForm | null;
}

// The tool form each hash names, from the erasable fields of the record that listed it. A hash that
// no listing held reads as none, and one whose key a forget deleted reads as unreadable.
export async function readFormsByHash(
  log: Log,
  hashes: readonly string[],
): Promise<Map<string, FoundForm>> {
  const found = new Map<string, FoundForm>(
    hashes.map((hash): [string, FoundForm] => [hash, { status: 'none', form: null }]),
  );

  if (hashes.length === 0) {
    return found;
  }

  const listed = await log.writer.db
    .$extendTables<McpTables>()
    .selectFrom('mcp_tool_forms')
    .selectAll()
    .where('hash', 'in', [...hashes])
    .execute();

  if (listed.length === 0) {
    return found;
  }

  const records = await readRecords(log, {
    afterSequence: 0,
    sequences: listed.map((row) => row.listed_seq),
    limit: listed.length,
  });

  const bySequence = new Map(records.map((entry) => [entry.record.sequence, entry.record]));

  for (const row of listed) {
    const record = bySequence.get(row.listed_seq);
    const erasable = record?.erasable;

    if (erasable?.status === 'readable') {
      const form = parseToolForm(erasable.fields['form']);

      found.set(row.hash, { status: form === null ? 'unreadable' : 'readable', form });
    } else {
      found.set(row.hash, { status: 'unreadable', form: null });
    }
  }

  return found;
}
