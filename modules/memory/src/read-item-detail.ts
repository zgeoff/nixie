import type { Log } from '@heynixie/log';
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
    .leftJoin('memory_proposals', 'memory_proposals.proposal_id', 'memory_versions.proposal_id')
    .selectAll('memory_versions')
    .select('memory_proposals.thread as proposal_thread')
    .where('memory_versions.item_id', '=', itemID)
    .orderBy('memory_versions.version')
    .execute();

  const key = await readItemKey(log, itemID);

  const messages = new Map<number, Promise<EvidenceMessage>>();

  const readMessage = (sequence: number): Promise<EvidenceMessage> => {
    const read = messages.get(sequence) ?? readEvidenceMessage(log, sequence);

    messages.set(sequence, read);

    return read;
  };

  const loadModel = (row: MemoryVersionRow): Promise<string | null> => loadWriterModel(log, row);

  const versions = await Promise.all(
    rows.map((row) => readViewVersion(row, { key, readMessage, loadModel })),
  );

  return { ...item, versions };
}

interface VersionReaders {
  readonly key: CryptoKey | null | undefined;
  readonly readMessage: (sequence: number) => Promise<EvidenceMessage>;
  readonly loadModel: (row: MemoryVersionRow) => Promise<string | null>;
}

interface DetailVersionRow extends MemoryVersionRow {
  readonly proposal_thread: string | null;
}

async function readViewVersion(
  row: DetailVersionRow,
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
    image:
      image === null || row.proposal_thread === null || opened.text.status !== 'readable'
        ? null
        : { thread: row.proposal_thread, ...image },
    ...opened.text,
  };
}
