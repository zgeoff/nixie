import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { CodeFilesTables } from './code-files-tables';
import type { CodeRunResult } from './parse-code-run-result';
import { parseCodeRunResult } from './parse-code-run-result';

export interface CodeFileRow {
  readonly thread: string;

  // the tool_result record that holds the file
  readonly sequence: number;
  readonly position: number;
  readonly bytes: number;
  readonly mediaType: string;
}

export type CodeFileEntry =
  | { readonly kind: 'missing' }
  | { readonly kind: 'forgotten'; readonly row: CodeFileRow }
  | {
      readonly kind: 'ok';
      readonly row: CodeFileRow;

      // the last segment of the file's path in the run's result
      readonly name: string;

      // the file is a kept stream of the run, not a file the program wrote
      readonly isStream: boolean;
      readonly recordedAt: Date;
    };

// A file of any thread, with what its run's result says about it. A file whose result record a
// forget made unreadable reads as forgotten, with no name.
export async function readCodeFileEntry(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  fileID: string,
): Promise<CodeFileEntry> {
  const stored = await log.writer.db
    .$extendTables<CodeFilesTables>()
    .selectFrom('code_files')
    .selectAll()
    .where('file_id', '=', fileID)
    .executeTakeFirst();

  if (stored === undefined) {
    return { kind: 'missing' };
  }

  const row: CodeFileRow = {
    thread: stored.thread,
    sequence: stored.sequence,
    position: stored.position,
    bytes: stored.bytes,
    mediaType: stored.media_type,
  };

  const [found] = await readRecords(log, {
    afterSequence: row.sequence - 1,
    sequences: [row.sequence],
  });

  if (found === undefined || found.record.erasable.status !== 'readable') {
    return { kind: 'forgotten', row };
  }

  const content = parseCodeRunResult(found.record.erasable.fields);

  if (content === undefined) {
    return { kind: 'forgotten', row };
  }

  const written = content.files.find((file) => file.file === fileID);
  const path = written?.path ?? findStreamPath(content, fileID);

  if (path === undefined) {
    return { kind: 'missing' };
  }

  return {
    kind: 'ok',
    row,
    name: path.split('/').at(-1) ?? path,
    isStream: written === undefined,
    recordedAt: found.record.recordedAt,
  };
}

function findStreamPath(content: CodeRunResult, fileID: string): string | undefined {
  if (content.stdout.file === fileID) {
    return '.stdout';
  }

  return content.stderr.file === fileID ? '.stderr' : undefined;
}
