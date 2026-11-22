import type { Log, LogTables } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import type { ImageRow, ImageTables } from './image-tables';
import { readGalleryImages } from './read-gallery-images';
import type { GalleryImage } from './types';

const galleryPageSize = 30;
const galleryScanLimit = 300;

export interface GalleryPageQuery {
  readonly isPinnedOnly: boolean;

  // lists the rows older than this rowid
  readonly cursor: number | null;
}

export interface GalleryPage {
  readonly images: readonly GalleryImage[];

  // the rowid of the oldest row read; null on the last page
  readonly nextCursor: string | null;
}

type ScannedRow = ImageRow & { readonly row_id: unknown };

// One page of the stored images, newest first. A call reads at most 300 rows and leaves out each
// forgotten image, so a page can hold fewer than 30 images, or none, while the cursor remains.
export async function readGalleryPage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: GalleryPageQuery,
): Promise<GalleryPage> {
  const scanned = await readScannedRows(log, query);
  const keyed = await readKeyedSequences(log, scanned);

  const kept: ScannedRow[] = [];
  let last: ScannedRow | null = null;

  for (const row of scanned) {
    last = row;

    if (keyed.has(row.sequence)) {
      kept.push(row);
    }

    if (kept.length === galleryPageSize) {
      break;
    }
  }

  const isScanDone = last === null || last === scanned.at(-1);
  const isLastPage = isScanDone && scanned.length < galleryScanLimit;

  return {
    images: await readGalleryImages(log, kept),
    nextCursor: isLastPage || last === null ? null : String(z.number().parse(last.row_id)),
  };
}

async function readScannedRows(
  log: Pick<Log, 'writer'>,
  query: GalleryPageQuery,
): Promise<ScannedRow[]> {
  const rows = await log.writer.db
    .$extendTables<ImageTables>()
    .selectFrom('images')
    .selectAll()
    .select(sql`rowid`.as('row_id'))
    .$if(query.isPinnedOnly, (builder) => builder.where('is_pinned', '=', 1))
    .$if(query.cursor !== null, (builder) => builder.where(sql`rowid`, '<', query.cursor))
    .orderBy(sql`rowid`, 'desc')
    .limit(galleryScanLimit)
    .execute();

  return rows;
}

// The sequences among the rows whose result record still has its key.
async function readKeyedSequences(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  rows: readonly ScannedRow[],
): Promise<ReadonlySet<number>> {
  if (rows.length === 0) {
    return new Set();
  }

  const records = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'key_id'])
    .where(
      'sequence',
      'in',
      rows.map((row) => row.sequence),
    )
    .execute();

  const keyIDs = records.flatMap((record) => (record.key_id === null ? [] : [record.key_id]));

  const keys = await readRecordKeys(log, keyIDs);

  return new Set(
    records
      .filter((record) => record.key_id !== null && keys.get(record.key_id))
      .map((record) => record.sequence),
  );
}
