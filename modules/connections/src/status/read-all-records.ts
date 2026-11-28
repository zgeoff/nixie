import { readRecords } from '@heynixie/log';
import type { Log, LogRecord, RecordKind } from '@heynixie/log';

const pageSize = 1000;

// Every record of the kinds, oldest first, in pages.
export async function readAllRecords(log: Log, kinds: readonly RecordKind[]): Promise<LogRecord[]> {
  const found: LogRecord[] = [];
  let after = 0;

  for (;;) {
    const page = await readRecords(log, { afterSequence: after, kinds, limit: pageSize });

    found.push(...page.map((entry) => entry.record));

    const last = page.at(-1);

    if (last === undefined || page.length < pageSize) {
      return found;
    }

    after = last.record.sequence;
  }
}
