import type { Log, LogRecord, RecordWithChanges } from '@heynixie/log';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { z } from 'zod';
import { buildDefinitionHash } from '../task/build-definition-hash';
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

  // A record from before the target key left holds it in the sealed form, and the hash the records
  // name is the one of the form without it. A conversation definition is a reminder now.
  if (version.form['target'] === 'conversation') {
    return [];
  }

  if (!('target' in version.form)) {
    return [
      { id: version.definitionID, hash: version.hash, form: version.form, files: version.files },
    ];
  }

  const { target: _target, ...form } = version.form;
  const stepFile = z.looseObject({ file: z.string() }).safeParse(form['step']);

  const hash = buildDefinitionHash({
    id: version.definitionID,
    form,
    instructions: version.files[`tasks/${version.definitionID}/instructions.md`],
    step: stepFile.success
      ? version.files[`tasks/${version.definitionID}/${stepFile.data.file}`]
      : undefined,
  });

  return [{ id: version.definitionID, hash, form, files: dropTargetFromYaml(version) }];
}

// A chat-built version keeps its task.yaml as JSON text, which names the target too.
interface VersionFiles {
  readonly definitionID: string;
  readonly files: Record<string, string>;
}

function dropTargetFromYaml(version: VersionFiles): Record<string, string> {
  const path = `tasks/${version.definitionID}/task.yaml`;
  const text = version.files[path];

  if (text === undefined) {
    return version.files;
  }

  const mapping = z.record(z.string(), z.json()).safeParse(parseJSONText(text));

  if (!mapping.success || !('target' in mapping.data)) {
    return version.files;
  }

  const { target: _target, ...rest } = mapping.data;

  return { ...version.files, [path]: JSON.stringify(rest) };
}

function parseJSONText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
