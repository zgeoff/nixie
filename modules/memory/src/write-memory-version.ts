import type { JSONObject, RecordInput } from '@heynixie/log';
import { createRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { encodeVersionText } from './encode-version-text';
import { findItemKey } from './find-item-key';
import type { ReadableVersion } from './read-version';
import { readVersion } from './read-version';
import type { ItemRequirement } from './require-item';
import { requireItem } from './require-item';
import type {
  MemoryChange,
  MemoryTables,
  Provenance,
  QuoteEvidence,
  StoreParts,
  VersionRef,
  VersionState,
  VersionText,
} from './types';

// The version an operation adds, built from the versions of the item before it.
export interface NewVersion {
  readonly change: MemoryChange;
  readonly state: VersionState;
  readonly text: VersionText;
  readonly evidence: QuoteEvidence | null;
  readonly intentEvidence: QuoteEvidence | null;
}

// Reads one earlier version of the item, decrypted.
export type ReadEarlierVersion = (version: number) => Promise<ReadableVersion>;

export interface VersionPlan {
  // the item and the version the caller read, with the states the operation applies to, or null
  // for a new item
  readonly requirement: ItemRequirement | null;
  readonly provenance: Provenance;
  readonly buildVersion: (readEarlier: ReadEarlierVersion, current: number) => Promise<NewVersion>;

  // pins a new item in the same transaction
  readonly isPinned?: boolean;
}

// Adds one version to an item, or creates the item with its key and first version, under the
// delivery lock. The stale-version check, the record and the item's row commit in one transaction,
// then the index takes the item's current text, or drops an item that left the active state.
export function writeMemoryVersion(parts: StoreParts, plan: VersionPlan): Promise<VersionRef> {
  const log = parts.context.log;

  return parts.lock(async () => {
    const written = await withWriteTransaction(log.writer, async (tx) => {
      const db = tx.$extendTables<MemoryTables>();
      const item = plan.requirement === null ? null : await requireItem(db, plan.requirement);
      const itemID = item?.item_id ?? crypto.randomUUID();
      const current = item?.version ?? 0;
      const key = await (item === null ? createItemKey(parts, itemID) : requireKey(parts, itemID));
      const next = await plan.buildVersion(
        (version) => readVersion(db, key, { itemID, version }),
        current,
      );
      const ref = { itemID, version: current + 1 };
      const sealed = await encodeVersionText(key, ref, next.text);

      await writeRecordsInTransaction(tx, log, buildRecords(parts, { plan, ref, next, sealed }));
      return { ref, next };
    });

    await updateIndex(parts, written.ref.itemID, written.next);
    return written.ref;
  });
}

async function createItemKey(parts: StoreParts, itemID: string): Promise<CryptoKey> {
  const created = await createRecordKey(parts.context.log, itemID);

  return created.key;
}

async function requireKey(parts: StoreParts, itemID: string): Promise<CryptoKey> {
  const key = await findItemKey(parts.context.log, itemID);

  if (key === null || key === undefined) {
    throw new Error(`memory item ${itemID} has no readable key`);
  }
  return key;
}

interface WrittenVersion {
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly next: NewVersion;
  readonly sealed: string;
}

function buildRecords(parts: StoreParts, written: WrittenVersion): readonly RecordInput[] {
  const provenance = written.plan.provenance;
  const base = {
    definitions: parts.context.definitions(),
    ...(provenance.thread === undefined ? {} : { thread: provenance.thread }),
  };
  const payload: JSONObject = {
    itemID: written.ref.itemID,
    version: written.ref.version,
    change: written.next.change,
    state: written.next.state,
    sealed: written.sealed,
    evidence: toJSONEvidence(written.next.evidence),
    intentEvidence: toJSONEvidence(written.next.intentEvidence),
    origin: provenance.origin,
    source: provenance.source,
    taskID: provenance.taskID,
    proposalID: provenance.proposalID,
    checks: provenance.checks,
  };
  const version: RecordInput = {
    ...base,
    kind: 'memory.version_added',
    contentSource: provenance.source,
    payload,
  };

  return written.plan.isPinned === true
    ? [
        version,
        { ...base, kind: 'memory.pinned', payload: { itemID: written.ref.itemID, isPinned: true } },
      ]
    : [version];
}

function toJSONEvidence(evidence: QuoteEvidence | null): JSONObject | null {
  return evidence === null
    ? null
    : { recordSequence: evidence.recordSequence, start: evidence.start, end: evidence.end };
}

async function updateIndex(parts: StoreParts, itemID: string, next: NewVersion): Promise<void> {
  await (next.state === 'active'
    ? parts.index.update({ itemID, text: next.text.text })
    : parts.index.remove(itemID));
}
