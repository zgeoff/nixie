import type { Log } from '@heynixie/log';
import { findCheckerModel } from './find-checker-model';
import { findItemKey } from './find-item-key';
import { findWriterModel } from './find-writer-model';
import { parseChecks } from './parse-checks';
import { parseEvidence } from './parse-evidence';
import { readEvidenceMessage } from './read-evidence-message';
import { readViewItems } from './read-view-items';
import { readViewText } from './read-view-text';
import type { MemoryTables, MemoryVersionRow } from './types';
import type { EvidenceMessage, ViewItemDetail, ViewVersion } from './view-types';

// Reads one item with every version, oldest first, each with its provenance and its quote inside
// the message it came from. A version whose text is not readable shows no message, so a forgotten
// item never shows the words it came from.
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

  const key = await findItemKey(log, itemID);

  // versions that copy their text, such as a retirement, share their message, so each reads once
  const messages = new Map<number, Promise<EvidenceMessage>>();

  const readMessage = (sequence: number): Promise<EvidenceMessage> => {
    const read = messages.get(sequence) ?? readEvidenceMessage(log, sequence);

    messages.set(sequence, read);

    return read;
  };

  const findModel = (row: MemoryVersionRow): Promise<string | null> => findWriterModel(log, row);

  const versions = await Promise.all(
    rows.map((row) => readViewVersion(row, { key, readMessage, findModel })),
  );

  return { ...item, versions };
}

interface VersionReaders {
  readonly key: CryptoKey | null | undefined;
  readonly readMessage: (sequence: number) => Promise<EvidenceMessage>;
  readonly findModel: (row: MemoryVersionRow) => Promise<string | null>;
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
    writerModel: await readers.findModel(row),
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
    ...opened.text,
  };
}
