import type { Log } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { CodeFilesTables } from './code-files-tables';

export type CodeFileRead =
  | { readonly kind: 'missing' }
  | { readonly kind: 'forgotten' }
  | { readonly kind: 'ok'; readonly bytes: Uint8Array<ArrayBuffer> };

export interface CodeFileLocation {
  readonly sequence: number;
  readonly position: number;
}

export interface CodeFileRef {
  readonly thread: string;
  readonly fileID: string;
}

// A file of an earlier code run on the thread. A file of another thread reads as missing, and a
// file whose result record a forget made unreadable reads as forgotten.
export async function readCodeFile(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  file: CodeFileRef,
): Promise<CodeFileRead> {
  const row = await log.writer.db
    .$extendTables<CodeFilesTables>()
    .selectFrom('code_files')
    .selectAll()
    .where('file_id', '=', file.fileID)
    .executeTakeFirst();

  if (row === undefined || row.thread !== file.thread) {
    return { kind: 'missing' };
  }

  const bytes = await readCodeFileBytes(log, row);

  return bytes === undefined ? { kind: 'forgotten' } : { kind: 'ok', bytes };
}

// The bytes of a stored file, or undefined when a forget made its result record unreadable.
export async function readCodeFileBytes(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  row: CodeFileLocation,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const attachments = await readRecordAttachments(log, [row.sequence]);

  const stored = attachments.get(row.sequence);

  return stored?.status === 'readable' ? stored.attachments[row.position] : undefined;
}
