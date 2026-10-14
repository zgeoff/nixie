import type { Approval, ContentSource, JSONObject, RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely, Transaction } from 'kysely';
import { encodeVersionText } from './encode-version-text';
import { MemoryStateError } from './memory-state-error';
import type { ReadableVersion } from './read-version';
import { readVersion } from './read-version';
import { readVersionKey } from './read-version-key';
import type { ItemRequirement } from './require-item';
import { requireItem } from './require-item';
import { requireVersionCoreRoom } from './require-version-core-room';
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

  // the ID of a new item whose key already exists, as for an approved proposal that created it
  readonly newItemID?: string;

  // the turn's or the batch's notice the version joins
  readonly noticeKey?: string;

  // checks that the operation may still run, inside the version's transaction
  readonly requireInTransaction?: (db: Kysely<MemoryTables>) => Promise<void>;

  // the approval the version consumes: its envelope, and the record that holds your answer
  readonly approval?: {
    readonly envelope: Approval;
    readonly record: RecordInput;
  };
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

  await plan.requireInTransaction?.(db);

  const item = plan.requirement === null ? null : await requireItem(db, plan.requirement);
  const current = item?.version ?? 0;
  const versionKey = await readVersionKey(parts, plan.newItemID, item);
  const next = await plan.buildVersion(
    (version) => readVersion(db, versionKey.key, { itemID: versionKey.itemID, version }),
    current,
  );
  const ref = { itemID: versionKey.itemID, version: current + 1 };
  const sealed = await encodePinnableVersion(parts, db, {
    key: versionKey.key,
    plan,
    ref,
    shortID: versionKey.shortID,
    next,
    wasPinned: item?.is_pinned === 1,
  });

  await writeRecordsInTransaction(
    tx,
    parts.context.log,
    buildRecords(parts, { plan, ref, shortID: versionKey.shortID, next, sealed }),
  );
  return { ref, next };
}

interface PinnableVersion {
  readonly key: CryptoKey;
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly shortID: string;
  readonly next: NewVersion;

  // whether the item was pinned before this version
  readonly wasPinned: boolean;
}

// Seals the new version's text, after it refuses a pin of a version that is not active, because
// only an active item joins the pinned core. A version that leaves the item pinned must fit the
// core's budget, because an edit, an undo or a batch write of a pinned item changes the core.
async function encodePinnableVersion(
  parts: StoreParts,
  db: Kysely<MemoryTables>,
  version: PinnableVersion,
): Promise<string> {
  const isPinned = version.plan.isPinned === true;

  if (isPinned && version.next.state !== 'active') {
    throw new MemoryStateError(version.ref.itemID, 'pin', version.next.state);
  }
  if (version.next.state === 'active' && (isPinned || version.wasPinned)) {
    const provenance = version.plan.provenance;

    await requireVersionCoreRoom(parts, db, {
      itemID: version.ref.itemID,
      shortID: version.shortID,
      version: version.ref.version,
      text: version.next.text.text,
      origin: provenance.origin,
      source: version.next.source ?? provenance.source,
      proposalID: provenance.proposalID,
      evidenceQuote: version.next.text.evidenceQuote,
    });
  }
  return encodeVersionText(version.key, version.ref, version.next.text);
}

interface SealedVersion {
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly shortID: string;
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
    model: provenance.model ?? null,
    noticeKey: written.plan.noticeKey ?? null,
    ...(written.next.change === 'created' ? { shortID: written.shortID } : {}),
  };
  const approval = written.plan.approval;
  const version: RecordInput = {
    ...base,
    kind: 'memory.version_added',
    contentSource: written.next.source ?? provenance.source,
    ...(approval === undefined ? {} : { approval: approval.envelope }),
    payload,
  };
  const pinned: readonly RecordInput[] =
    written.plan.isPinned === true
      ? [
          {
            ...base,
            kind: 'memory.pinned',
            payload: { itemID: written.ref.itemID, isPinned: true },
          },
        ]
      : [];

  return [...(approval === undefined ? [] : [approval.record]), version, ...pinned];
}

function toJSONEvidence(evidence: QuoteEvidence | null): JSONObject | null {
  return evidence === null
    ? null
    : { recordSequence: evidence.recordSequence, start: evidence.start, end: evidence.end };
}
