import type { Approval, ContentSource, JSONObject, RecordInput } from '@heynixie/log';
import { createRecordKey, writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely, Transaction } from 'kysely';
import { writeLabelsInTransaction } from '../label/write-labels-in-transaction';
import type {
  Labels,
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
} from '../types';
import { MemoryStateError } from '../utils/error/memory-state-error';
import { getRowSubject } from '../utils/get-row-subject';
import type { ItemRequirement } from '../utils/item/require-item';
import { requireItem } from '../utils/item/require-item';
import { encodeVersionText } from './encode-version-text';
import type { ReadableVersion } from './read-version';
import { readVersion } from './read-version';
import { readVersionKey } from './read-version-key';
import type { VersionQuoteSeals } from './read-version-quote-seals';
import { readVersionQuoteSeals } from './read-version-quote-seals';
import { requireVersionCoreRoom } from './require-version-core-room';

export interface NewVersion {
  readonly change: MemoryChange;

  readonly source?: ContentSource;
  readonly state: VersionState;
  readonly text: VersionText;
  readonly evidence: QuoteEvidence | null;
  readonly intentEvidence: QuoteEvidence | null;
  readonly until: number | null;

  readonly subject?: MemorySubject;
}

type ReadEarlierVersion = (version: number) => Promise<ReadableVersion>;

export interface VersionLabels {
  readonly labels: Labels;
  readonly change: 'written' | 'backfilled';
}

export interface VersionPlan {
  readonly requirement: ItemRequirement | null;
  readonly provenance: Provenance;
  readonly readNextVersion: (
    readEarlier: ReadEarlierVersion,
    current: number,
  ) => Promise<NewVersion>;

  readonly isPinned?: boolean;

  readonly subject?: MemorySubject;

  readonly labels?: VersionLabels;

  readonly newItemID?: string;

  // a purge's bridge version, which no write check covers
  readonly isBridge?: boolean;

  readonly noticeKey?: string;

  readonly requireInTransaction?: (db: Kysely<unknown>) => Promise<void>;

  readonly writeInTransaction?: WriteInTransaction;

  readonly approval?: {
    readonly envelope: Approval;
    readonly record: RecordInput;
  };
}

export interface WrittenVersion {
  readonly ref: VersionRef;

  // the item's revision once the version lands
  readonly revision: number;
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

  const versionKey = await readVersionKey(parts, tx, plan.newItemID, item);

  const next = await plan.readNextVersion(
    (version) => readVersion(parts.context.log, tx, { itemID: versionKey.itemID, version }),
    current,
  );

  const ref = { itemID: versionKey.itemID, version: current + 1 };
  const revision = ref.version + (item?.label_edits ?? 0);
  const previousSubject = item === null ? null : getRowSubject(item);
  const subject = next.subject ?? plan.subject ?? previousSubject ?? 'owner';

  const textKey = await createRecordKey(parts.context.log, `${ref.itemID}/${crypto.randomUUID()}`);

  const quotes = await readVersionQuoteSeals(parts.context.log, tx, {
    itemID: ref.itemID,
    version: ref.version,
    versionKey: textKey.key,
    text: next.text,
    evidence: next.evidence,
    intentEvidence: next.intentEvidence,
  });

  const sealed = await encodePinnableVersion(parts, tx, {
    key: textKey.key,
    plan,
    ref,
    revision,
    shortID: versionKey.shortID,
    subject,
    next,
    wasPinned: item?.is_pinned === 1,
  });

  const move =
    previousSubject === null || previousSubject === subject ? null : { previousSubject, subject };

  await writeRecordsInTransaction(
    tx,
    parts.context.log,
    buildRecords(parts, {
      plan,
      ref,
      shortID: versionKey.shortID,
      next,
      sealed,
      keyed: { keyID: textKey.keyID, ...quotes },
      move,
    }),
  );

  if (plan.labels !== undefined) {
    await writeLabelsInTransaction(parts, tx, {
      itemID: ref.itemID,
      key: versionKey.key,
      revision,
      version: ref.version,
      change: plan.labels.change,
      labels: plan.labels.labels,
      origin: plan.labels.change === 'backfilled' ? 'migration' : plan.provenance.origin,
      source: next.source ?? plan.provenance.source,
      taskID: plan.provenance.taskID,
      proposalID: plan.provenance.proposalID,
      model: plan.provenance.model ?? null,
      ...(plan.provenance.thread === undefined ? {} : { thread: plan.provenance.thread }),
    });
  }

  return { ref, revision, next };
}

async function runCallerSteps(plan: VersionPlan, tx: Transaction<unknown>): Promise<void> {
  await plan.requireInTransaction?.(tx);
  await plan.writeInTransaction?.(tx);
}

interface PinnableVersion {
  readonly key: CryptoKey;
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly revision: number;
  readonly shortID: string;
  readonly subject: MemorySubject;
  readonly next: NewVersion;

  readonly wasPinned: boolean;
}

async function encodePinnableVersion(
  parts: StoreParts,
  db: Kysely<unknown>,
  version: PinnableVersion,
): Promise<string> {
  const isPinned = version.plan.isPinned === true;

  if (isPinned && version.next.state !== 'active') {
    throw new MemoryStateError(version.ref.itemID, 'pin', version.next.state);
  }

  const isBridge = version.plan.isBridge === true;

  if (!isBridge && version.next.state === 'active' && (isPinned || version.wasPinned)) {
    const provenance = version.plan.provenance;

    await requireVersionCoreRoom(parts, db, {
      itemID: version.ref.itemID,
      shortID: version.shortID,
      subject: version.subject,
      version: version.ref.version,
      revision: version.revision,
      text: version.next.text.text,
      origin: provenance.origin,
      source: version.next.source ?? provenance.source,
      proposalID: provenance.proposalID,
      evidenceQuote: version.next.text.evidenceQuote,
    });
  }

  return encodeVersionText(version.key, version.ref, {
    text: version.next.text.text,
    evidenceQuote: null,
    intentQuote: null,
  });
}

interface SubjectMove {
  readonly previousSubject: MemorySubject;
  readonly subject: MemorySubject;
}

interface SealedVersion {
  readonly plan: VersionPlan;
  readonly ref: VersionRef;
  readonly shortID: string;
  readonly next: NewVersion;
  readonly sealed: string;
  readonly keyed: { readonly keyID: string } & VersionQuoteSeals;
  readonly move: SubjectMove | null;
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

  const subject = written.plan.subject ?? 'owner';

  const marked: readonly RecordInput[] =
    written.next.change === 'created' && subject !== 'owner'
      ? [{ ...base, kind: itemMarkKinds[subject], payload: { itemID: written.ref.itemID } }]
      : [];

  const move = written.move;

  const keyed: RecordInput = {
    ...base,
    kind: 'memory.version_keyed',
    payload: {
      itemID: written.ref.itemID,
      version: written.ref.version,
      keyID: written.keyed.keyID,
      evidenceQuote: written.keyed.evidenceQuote,
      intentQuote: written.keyed.intentQuote,
    },
  };

  const changed: readonly RecordInput[] =
    move === null
      ? []
      : [
          {
            ...base,
            kind: 'memory.subject_changed',
            payload: { itemID: written.ref.itemID, version: written.ref.version, ...move },
          },
        ];

  return [
    ...(approval === undefined ? [] : [approval.record]),
    version,
    keyed,
    ...marked,
    ...changed,
    ...pinned,
  ];
}

function toJSONEvidence(evidence: QuoteEvidence | null): JSONObject | null {
  return evidence === null
    ? null
    : { recordSequence: evidence.recordSequence, start: evidence.start, end: evidence.end };
}
