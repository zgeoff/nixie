import type { Log, LogTables } from '@heynixie/log';
import { findCheckerModel } from './find-checker-model';
import { findImageSource } from './find-image-source';
import { loadWriterModel } from './load-writer-model';
import { parseChecks } from './parse-checks';
import { parseEvidence } from './parse-evidence';
import { readEvidenceMessage } from './read-evidence-message';
import { readItemKey } from './read-item-key';
import { readViewItems } from './read-view-items';
import { readViewText } from './read-view-text';
import type { MemoryTables, MemoryVersionRow } from './types';
import type { EvidenceMessage, ViewItemDetail, ViewVersion } from './view-types';

export async function readItemDetail(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  itemID: string,
): Promise<ViewItemDetail | null> {
  const [item] = await readViewItems(log, [itemID]);

  if (item === undefined) {
    return null;
  }

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', '=', itemID)
    .orderBy('version')
    .execute();

  const key = await readItemKey(log, itemID);

  const messages = new Map<number, Promise<EvidenceMessage>>();

  const readMessage = (sequence: number): Promise<EvidenceMessage> => {
    const read = messages.get(sequence) ?? readEvidenceMessage(log, sequence);

    messages.set(sequence, read);

    return read;
  };

  const loadModel = (row: MemoryVersionRow): Promise<string | null> => loadWriterModel(log, row);
  const readThread = (sequence: number): Promise<string | null> => readRecordThread(log, sequence);

  const versions = await Promise.all(
    rows.map((row) => readViewVersion(row, { key, readMessage, loadModel, readThread })),
  );

  return { ...item, versions };
}

async function readRecordThread(
  log: Pick<Log, 'writer'>,
  sequence: number,
): Promise<string | null> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('thread')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  return row?.thread ?? null;
}

interface VersionReaders {
  readonly key: CryptoKey | null | undefined;
  readonly readMessage: (sequence: number) => Promise<EvidenceMessage>;
  readonly loadModel: (row: MemoryVersionRow) => Promise<string | null>;
  readonly readThread: (sequence: number) => Promise<string | null>;
}

async function readViewVersion(
  row: MemoryVersionRow,
  readers: VersionReaders,
): Promise<ViewVersion> {
  const opened = await readViewText(readers.key, {
    itemID: row.item_id,
    version: row.version,
    sealed: row.sealed,
  });

  const evidence = parseEvidence(row.evidence);
  const checks = row.checks === null ? null : parseChecks(row.checks);
  const image = checks === null ? null : findImageSource(checks);
  const isImageShown = image !== null && opened.text.status === 'readable';
  const thread = isImageShown ? await readers.readThread(image.messageSequence) : null;

  return {
    version: row.version,
    change: row.change,
    state: row.state,
    origin: row.origin,
    source: row.source,
    recordedAt: row.recorded_at,
    taskID: row.task_id,
    proposalID: row.proposal_id,
    checks,
    writerModel: await readers.loadModel(row),
    checkerModel: findCheckerModel(checks),
    evidenceQuote: opened.evidenceQuote,
    evidence:
      evidence === null
        ? null
        : {
            ...evidence,
            message:
              opened.text.status === 'readable'
                ? await readers.readMessage(evidence.recordSequence)
                : null,
          },
    image: image === null || thread === null ? null : { thread, ...image },
    ...opened.text,
  };
}
