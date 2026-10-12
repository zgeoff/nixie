import type { ContentSource, JSONObject, RecordInput } from '@heynixie/log';
import { createRecordKey, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { encodeVersionText } from './encode-version-text';
import { findItemKey } from './find-item-key';
import { MemoryStateError } from './memory-state-error';
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

  // the source of the copied text, which a change that keeps earlier text keeps too, so a state
  // change never relabels outside content as the actor's words
  readonly source?: ContentSource;
  readonly state: VersionState;
  readonly text: VersionText;
  readonly evidence: QuoteEvidence | null;
  readonly intentEvidence: QuoteEvidence | null;
}

// Reads one earlier version of the item, decrypted.
type ReadEarlierVersion = (version: number) => Promise<ReadableVersion>;

export interface VersionPlan {
  // the item and the version the caller read, with the states the operation applies to, or null
  // for a new item
  readonly requirement: ItemRequirement | null;
  readonly provenance: Provenance;
  readonly buildVersion: (readEarlier: ReadEarlierVersion, current: number) => Promise<NewVersion>;

  // pins a new item in the same transaction
  readonly isPinned?: boolean;
}

// The version a write added, and the version it describes, for the index update after the commit.
export interface WrittenVersion {
  readonly ref: VersionRef;
  readonly next: NewVersion;
}

// Adds one version to an item, or creates the item with its key and first version, inside the
// caller's write transaction, which the delivery lock must hold. The stale-version check, the
// record and the item's row commit with the transaction, and the caller updates the index after.
export async function writeVersionInTransaction(
  parts: StoreParts,
  tx: Transaction<unknown>,
  plan: VersionPlan,
): Promise<WrittenVersion> {
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

  const sealed = await encodePinnableVersion(key, { plan, ref, next });

  await writeRecordsInTransaction(
    tx,
    parts.context.log,
    buildRecords(parts, { plan, ref, next, sealed }),
  );
  return { ref, next };
}

interface PinnableVersion {
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly next: NewVersion;
}

// Seals the new version's text, after it refuses a pin of a version that is not active, because
// only an active item joins the pinned core, as a separate pin requires.
function encodePinnableVersion(key: CryptoKey, version: PinnableVersion): Promise<string> {
  if (version.plan.isPinned === true && version.next.state !== 'active') {
    throw new MemoryStateError(version.ref.itemID, 'pin', version.next.state);
  }
  return encodeVersionText(key, version.ref, version.next.text);
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

interface SealedVersion {
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly next: NewVersion;
  readonly sealed: string;
}

function buildRecords(parts: StoreParts, written: SealedVersion): readonly RecordInput[] {
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
    source: written.next.source ?? provenance.source,
    taskID: provenance.taskID,
    proposalID: provenance.proposalID,
    checks: provenance.checks,
  };
  const version: RecordInput = {
    ...base,
    kind: 'memory.version_added',
    contentSource: written.next.source ?? provenance.source,
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
