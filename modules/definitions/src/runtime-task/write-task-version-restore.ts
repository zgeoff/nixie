import type { Log, LogRecord, RecordWithChanges } from '@heynixie/log';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { z } from 'zod';
import type { TaskDefinition } from '../task/types';
import { writeTaskVersions } from '../task/write-task-versions';
import { definitionChangedCodec } from './definition-changed-codec';

const pageSize = 100;

// Puts back the body of each version that a readable definition.changed record holds and the
// versions table lacks. A record whose key is gone or whose change has no version adds nothing.
// Run it after a projection rebuild on a database that was rebuilt from the records alone.
export async function writeTaskVersionRestore(log: Log): Promise<void> {
  let after = 0;
  let done = false;

  while (!done) {
    const page = await readRecords(log, {
      afterSequence: after,
      kinds: [definitionChangedCodec.kind],
      limit: pageSize,
    });

    const definitions = page.flatMap((entry) => collectReadableVersion(entry));

    await withWriteTransaction(log.writer, (tx) => writeTaskVersions(tx, definitions));

    after = page.at(-1)?.record.sequence ?? after;
    done = page.length < pageSize;
  }
}

const textRecord = z.record(z.string(), z.string());
const formRecord = z.record(z.string(), z.json());

const erasableSchema = z.object({
  version: z.object({
    definitionID: z.string(),
    hash: z.string(),
    form: formRecord,
    files: textRecord,
  }),
});

function collectReadableVersion(entry: RecordWithChanges): TaskDefinition[] {
  const record: LogRecord = entry.record;

  if (record.erasable.status !== 'readable') {
    return [];
  }

  const parsed = erasableSchema.safeParse(record.erasable.fields);

  if (!parsed.success) {
    return [];
  }

  const version = parsed.data.version;

  return [
    { id: version.definitionID, hash: version.hash, form: version.form, files: version.files },
  ];
}
