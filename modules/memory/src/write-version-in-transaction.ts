import type { Approval, ContentSource, JSONObject, RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely, Transaction } from 'kysely';
import { encodeVersionText } from './encode-version-text';
import { getRowSubject } from './get-row-subject';
import { MemoryStateError } from './memory-state-error';
import type { ReadableVersion } from './read-version';
import { readVersion } from './read-version';
import { readVersionKey } from './read-version-key';
import type { ItemRequirement } from './require-item';
import { requireItem } from './require-item';
import { requireVersionCoreRoom } from './require-version-core-room';
import type {
  MemoryChange,
  MemorySubject,
  MemoryTables,
  Provenance,
  QuoteEvidence,
  StoreParts,
  VersionRef,
  VersionState,
  VersionText,
  WriteInTransaction,
} from './types';

export interface NewVersion {
  readonly change: MemoryChange;

  readonly source?: ContentSource;
  readonly state: VersionState;
  readonly text: VersionText;
  readonly evidence: QuoteEvidence | null;
  readonly intentEvidence: QuoteEvidence | null;
  readonly until: number | null;
}

type ReadEarlierVersion = (version: number) => Promise<ReadableVersion>;

export interface VersionPlan {
  readonly requirement: ItemRequirement | null;
  readonly provenance: Provenance;
  readonly readNextVersion: (
    readEarlier: ReadEarlierVersion,
    current: number,
  ) => Promise<NewVersion>;

  readonly isPinned?: boolean;

  readonly subject?: MemorySubject;

  readonly isSensitive?: boolean;

  readonly newItemID?: string;

  readonly noticeKey?: string;

  readonly requireInTransaction?: (db: Kysely<MemoryTables>) => Promise<void>;

  readonly writeInTransaction?: WriteInTransaction;

  readonly approval?: {
    readonly envelope: Approval;
    readonly record: RecordInput;
  };
}

export interface WrittenVersion {
  readonly ref: VersionRef;
  readonly next: NewVersion;
}

// The caller's transaction must hold the delivery lock, and the caller updates the index after the
// commit.
export async function writeVersionInTransaction(
  parts: StoreParts,
  tx: Transaction<unknown>,
  plan: VersionPlan,
): Promise<WrittenVersion> {
  const db = tx.$extendTables<MemoryTables>();

  await runCallerSteps(plan, tx);

  const item = plan.requirement === null ? null : await requireItem(db, plan.requirement);
  const current = item?.version ?? 0;

  const versionKey = await readVersionKey(parts, plan.newItemID, item);

  const next = await plan.readNextVersion(
    (version) => readVersion(db, versionKey.key, { itemID: versionKey.itemID, version }),
    current,
  );

  const ref = { itemID: versionKey.itemID, version: current + 1 };

  const sealed = await encodePinnableVersion(parts, db, {
    key: versionKey.key,
    plan,
    ref,
    shortID: versionKey.shortID,
    subject: item === null ? (plan.subject ?? 'owner') : getRowSubject(item),
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

async function runCallerSteps(plan: VersionPlan, tx: Transaction<unknown>): Promise<void> {
  await plan.requireInTransaction?.(tx.$extendTables<MemoryTables>());
  await plan.writeInTransaction?.(tx);
}

interface PinnableVersion {
  readonly key: CryptoKey;
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly shortID: string;
  readonly subject: MemorySubject;
  readonly next: NewVersion;

  readonly wasPinned: boolean;
}

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
      subject: version.subject,
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

const itemMarkKinds = {
  self: 'memory.self_noted',
  shared: 'memory.shared_noted',
} as const;

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
    ...(written.next.until === null ? {} : { until: written.next.until }),
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

  const sensitive: readonly RecordInput[] =
    written.plan.isSensitive === true
      ? [
          {
            ...base,
            kind: 'memory.sensitive_marked',
            payload: { itemID: written.ref.itemID, isSensitive: true },
          },
        ]
      : [];

  const subject = written.plan.subject ?? 'owner';

  const marked: readonly RecordInput[] =
    written.next.change === 'created' && subject !== 'owner'
      ? [{ ...base, kind: itemMarkKinds[subject], payload: { itemID: written.ref.itemID } }]
      : [];

  return [
    ...(approval === undefined ? [] : [approval.record]),
    version,
    ...marked,
    ...pinned,
    ...sensitive,
  ];
}

function toJSONEvidence(evidence: QuoteEvidence | null): JSONObject | null {
  return evidence === null
    ? null
    : { recordSequence: evidence.recordSequence, start: evidence.start, end: evidence.end };
}
