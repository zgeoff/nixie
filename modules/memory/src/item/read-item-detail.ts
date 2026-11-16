import type { Log, LogTables } from '@heynixie/log';
import { readEvidenceMessage } from '../evidence/read-evidence-message';
import { findImageSource } from '../image/find-image-source';
import { isBridgeVersion, readBridgeMarks } from '../item-key/read-bridge-marks';
import type { MemoryTables, MemoryVersionRow } from '../types';
import { findCheckerModel } from '../utils/checker/find-checker-model';
import { parseChecks } from '../utils/parse-checks';
import { parseEvidence } from '../utils/parse-evidence';
import type { EvidenceMessage, ViewItemDetail, ViewVersion } from '../view/memory-view';
import { readViewItems } from '../view/read-view-items';
import type { OpenedVersion } from '../view/read-view-texts';
import { readViewTexts } from '../view/read-view-texts';

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

  const opened = await readViewTexts(log, log.writer.db, rows);
  const marks = await readBridgeMarks(log.writer.db, [itemID]);

  const messages = new Map<number, Promise<EvidenceMessage>>();

  const readMessage = (sequence: number): Promise<EvidenceMessage> => {
    const read = messages.get(sequence) ?? readEvidenceMessage(log, sequence);

    messages.set(sequence, read);

    return read;
  };

  const readThread = (sequence: number): Promise<string | null> => readRecordThread(log, sequence);

  const versions = await Promise.all(
    rows.map((row, index) =>
      readViewVersion(row, {
        opened: opened[index],
        isBridge: isBridgeVersion(marks, itemID, row.version),
        readMessage,
        readThread,
      }),
    ),
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
  readonly opened: OpenedVersion | undefined;
  readonly isBridge: boolean;
  readonly readMessage: (sequence: number) => Promise<EvidenceMessage>;
  readonly readThread: (sequence: number) => Promise<string | null>;
}

async function readViewVersion(
  row: MemoryVersionRow,
  readers: VersionReaders,
): Promise<ViewVersion> {
  const opened = readers.opened ?? {
    text: { status: 'unreadable' },
    evidenceQuote: null,
    isRemoved: false,
  };

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
    writerModel: row.model,
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
    isRemoved: opened.isRemoved,
    isBridge: readers.isBridge,
    ...opened.text,
  };
}
