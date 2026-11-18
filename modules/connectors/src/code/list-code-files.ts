import { imageLimits } from '@heynixie/contract';
import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { CodeFileSendsTables, CodeFilesTables } from './code-files-tables';
import { parseCodeRunResult } from './parse-code-run-result';

export interface ListCodeFilesOptions {
  // the cursor of an earlier page, as its nextCursor gave it
  readonly cursor?: string | undefined;
  readonly kind?: 'image' | 'other' | undefined;
  readonly limit: number;
}

export interface ListedCodeFile {
  readonly file: string;
  readonly name: string;
  readonly bytes: number;
  readonly mediaType: string;
  readonly recordedAt: Date;
  readonly thread: string;
  readonly sequence: number;
  readonly position: number;

  // a file.send call sent the file to the user
  readonly isSent: boolean;

  // how many files the code run that wrote this one holds
  readonly runFileCount: number;
}

export interface ListedCodeFiles {
  readonly files: readonly ListedCodeFile[];
  readonly nextCursor: string | null;
}

// A call looks at this many stored rows, so a page of a store full of forgotten files stays cheap.
const scanLimit = 300;
const inlineTypes: readonly string[] = imageLimits.mediaTypes;

interface Position {
  readonly sequence: number;
  readonly position: number;
}

// The files that code runs wrote in out/, newest run first and in the order of the run within it.
// A kept stream and a file whose result record a forget made unreadable never show. A page can
// hold fewer than `limit` files while a cursor remains.
export async function listCodeFiles(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  options: ListCodeFilesOptions,
): Promise<ListedCodeFiles> {
  const after = parseCursor(options.cursor);
  const db = log.writer.db.$extendTables<CodeFilesTables & CodeFileSendsTables>();

  const rows = await db
    .selectFrom('code_files')
    .selectAll()
    .$if(options.kind === 'image', (query) => query.where('media_type', 'in', inlineTypes))
    .$if(options.kind === 'other', (query) => query.where('media_type', 'not in', inlineTypes))
    .$if(after !== null, (query) =>
      query.where((builder) =>
        builder.or([
          builder('sequence', '<', after?.sequence ?? 0),
          builder.and([
            builder('sequence', '=', after?.sequence ?? 0),
            builder('position', '>', after?.position ?? 0),
          ]),
        ]),
      ),
    )
    .orderBy('sequence', 'desc')
    .orderBy('position', 'asc')
    .limit(scanLimit)
    .execute();

  if (rows.length === 0) {
    return { files: [], nextCursor: null };
  }

  const sequences = [...new Set(rows.map((row) => row.sequence))];

  const records = await readRecords(log, {
    afterSequence: Math.min(...sequences) - 1,
    sequences,
    limit: sequences.length,
  });

  const results = new Map(
    records.flatMap((found) => {
      const content =
        found.record.erasable.status === 'readable'
          ? parseCodeRunResult(found.record.erasable.fields)
          : undefined;

      return content === undefined
        ? []
        : [[found.record.sequence, { content, recordedAt: found.record.recordedAt }] as const];
    }),
  );

  const sent = await db
    .selectFrom('code_file_sends')
    .select('file_id')
    .where(
      'file_id',
      'in',
      rows.map((row) => row.file_id),
    )
    .execute();

  const sentIDs = new Set(sent.map((send) => send.file_id));

  const files: ListedCodeFile[] = [];
  let last: Position | null = null;

  for (const [index, row] of rows.entries()) {
    last = { sequence: row.sequence, position: row.position };

    const result = results.get(row.sequence);
    const written = result?.content.files.find((file) => file.file === row.file_id);

    if (result !== undefined && written !== undefined) {
      files.push({
        file: row.file_id,
        name: written.path.split('/').at(-1) ?? written.path,
        bytes: row.bytes,
        mediaType: row.media_type,
        recordedAt: result.recordedAt,
        thread: row.thread,
        sequence: row.sequence,
        position: row.position,
        isSent: sentIDs.has(row.file_id),
        runFileCount: result.content.files.length,
      });
    }

    if (files.length === options.limit) {
      const hasMore = index < rows.length - 1 || rows.length === scanLimit;

      return { files, nextCursor: hasMore ? formatCursor(last) : null };
    }
  }

  return {
    files,
    nextCursor: rows.length === scanLimit && last !== null ? formatCursor(last) : null,
  };
}

function parseCursor(cursor: string | undefined): Position | null {
  const match = /^(?<sequence>\d+):(?<position>\d+)$/u.exec(cursor ?? '');

  return match?.groups === undefined
    ? null
    : { sequence: Number(match.groups['sequence']), position: Number(match.groups['position']) };
}

function formatCursor(position: Position): string {
  return `${position.sequence}:${position.position}`;
}
