import { createRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { RecordInput } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { writeLabelsInTransaction } from '../label/write-labels-in-transaction';
import { memoryEvidencePurgeClosedCodec } from '../record/memory-evidence-purge-closed-codec';
import type { MemoryItemRow, MemoryVersionRow, StoreParts, VersionText } from '../types';
import { parseChecks } from '../utils/parse-checks';
import { parseEvidence } from '../utils/parse-evidence';
import { readVersionValues } from '../version/read-version-values';
import { updateVersionIndex } from '../version/update-version-index';
import type { VersionPlan } from '../version/write-version-in-transaction';
import { writeVersionInTransaction } from '../version/write-version-in-transaction';
import type { PurgePlan } from './pick-purge-plan';
import type { CurrentLabels } from './read-current-labels';
import { readCurrentLabels } from './read-current-labels';
import type { PurgeFacts } from './read-purge-facts';
import { writeProposalLapses } from './write-proposal-lapses';

type CloseOfItem = Extract<PurgePlan, { kind: 'close' }>;

// Closes the purge of an item that exists: one commit holds the lapses, the bridge version, the
// closing record and the labels sealed again under the next generation key. Returns the keys that
// the commit owes a delete. The caller holds the delivery lock.
export async function writeItemClose(
  parts: StoreParts,
  facts: PurgeFacts,
  close: CloseOfItem,
): Promise<readonly string[]> {
  const log = parts.context.log;
  const item = facts.item;
  const currentVersion = facts.currentVersion;

  invariant(
    item !== null && currentVersion !== null,
    `item ${facts.itemID} has no current version`,
  );

  const next = await createRecordKey(log, `${facts.itemID}/${crypto.randomUUID()}`);
  const labels = await readCurrentLabels(parts, log.writer.db, facts.itemID);

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.purge.keys_created', { kind: 'memory', id: facts.itemID });
  }

  const bridge = close.isShared ? await readBridge(parts, facts, item, currentVersion) : null;
  const revision = item.version + item.label_edits + (bridge === null ? 0 : 1);
  const labelsRevision = labels === null ? null : revision + 1;

  const closed: RecordInput = {
    kind: memoryEvidencePurgeClosedCodec.kind,
    definitions: parts.context.definitions(),
    payload: memoryEvidencePurgeClosedCodec.encode({
      recordSequence: facts.recordSequence,
      itemID: facts.itemID,
      closedKeyIDs: [...close.closedKeyIDs],
      closedRecordKeyIDs: [...facts.rejectionKeyIDs],
      generationKeyID: next.keyID,
      bridgeVersion: bridge?.version ?? null,
      labelsRevision,
    }),
  };

  const written = await withWriteTransaction(log.writer, async (tx) => {
    await writeProposalLapses(tx, parts, facts);

    const bridged =
      bridge === null ? null : await writeVersionInTransaction(parts, tx, bridge.plan);

    await writeRecordsInTransaction(tx, log, [closed]);

    if (labels !== null && labelsRevision !== null) {
      await writeLabelsInTransaction(parts, tx, {
        itemID: facts.itemID,
        key: next.key,
        revision: labelsRevision,
        version: bridge?.version ?? item.version,
        change: 'edited',
        origin: 'owner',
        ...buildLabelProvenance(labels),
        labels: labels.labels,
      });
    }

    return bridged;
  });

  if (written !== null) {
    await updateVersionIndex(parts, facts.itemID, written.next);
  }

  return [...close.closedKeyIDs, ...facts.rejectionKeyIDs];
}

interface Bridge {
  readonly version: number;
  readonly plan: VersionPlan;
}

// The current text of a shared-key item, under a version key of its own. Null when the text does
// not open, so the keys go and every value of the item reads removed.
async function readBridge(
  parts: StoreParts,
  facts: PurgeFacts,
  item: MemoryItemRow,
  row: MemoryVersionRow,
): Promise<Bridge | null> {
  const log = parts.context.log;

  const [value] = await readVersionValues(log, log.writer.db, [row]);

  if (value?.status !== 'readable') {
    return null;
  }

  const version = item.version + 1;
  const evidence = keepEvidence(row.evidence, facts.recordSequence);
  const intentEvidence = keepEvidence(row.intent_evidence, facts.recordSequence);

  const text: VersionText = {
    text: value.text.text,
    evidenceQuote: evidence === null ? null : value.text.evidenceQuote,
    intentQuote: intentEvidence === null ? null : value.text.intentQuote,
  };

  return {
    version,
    plan: {
      requirement: {
        target: { itemID: facts.itemID, version: item.version + item.label_edits },
        operation: 'purge',
        states: ['active', 'retired'],
      },
      provenance: {
        origin: 'owner',
        source: row.source,
        taskID: row.task_id,
        proposalID: row.proposal_id,
        checks: row.checks === null ? null : parseChecks(row.checks),
        model: row.model,
      },
      readNextVersion: () =>
        Promise.resolve({
          change: 'edited',
          source: row.source,
          state: row.state,
          text,
          evidence,
          intentEvidence,
          until: row.until,
        }),
      isBridge: true,
    },
  };
}

function keepEvidence(column: string | null, recordSequence: number) {
  const evidence = parseEvidence(column);

  return evidence?.recordSequence === recordSequence ? null : evidence;
}

function buildLabelProvenance(labels: CurrentLabels) {
  return {
    source: labels.source,
    taskID: labels.taskID,
    proposalID: labels.proposalID,
    model: labels.model,
  };
}
