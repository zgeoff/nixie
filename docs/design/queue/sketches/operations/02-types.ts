// Operations: every agreed shape. Not compiled. No package imports this file.
// The docs that point here: backup-publish-and-fetch.md, backup-and-recovery.md,
// recovery-release.md, seed-rules.md. Usage: 01-usage.ts. Flows: 03-flow.ts.
// Where a doc and a sketch differ, the sketch wins for shapes and the doc wins for rules.
// A place marked (open: <name>) is not settled: open/operations.md holds the item.
// The rollback check and the evidence lanes have no agreed shape, so no section here is theirs.

// ---- A. Snapshot tags ----
// The backup job's package has one function that formats every tag and one that parses them.
// A tag that does not parse reads as absent.

type SnapshotTag =
  | `set-${number}` // on both snapshots: the set's sequence. The fetch reads it only on a snapshot with no publish number.
  | `kind-${BackupSetKind}` // on both snapshots
  | `publish-${number}` // on both snapshots: a positive integer
  | `legacy-set-${number}` // on the key snapshot only
  | `proven-from-${number}`; // on the key snapshot only

// ---- B. The repository interface ----
// One interface, with a restic adapter behind it. `ResticClient` holds 7 methods in the code:
// createRepository, writeSnapshot, readSnapshotIDs, removeSnapshots, runRetention, runPrune,
// runCheck. The fetch needs 2 more. Their names are not settled (open: repository method names).

interface BackupRepository /* the 7 methods of ResticClient, and: */ {
  // Lists every snapshot with its tags and its time.
  readSnapshots: () => Promise<readonly PublishedSnapshot[]>;
  // Restores one snapshot into a directory. It writes bytes to a file and never reads the
  // child's output as text, because text damages a database file.
  restoreSnapshot: (snapshotID: string, directory: string) => Promise<void>;
}

// ---- C. Published snapshots and the pick ----
// In the backup job's package. Both pick functions are pure functions over the 2 snapshot lists.

interface PublishedSnapshot {
  snapshotID: string;
  writtenAt: number; // restic's time
  set: number | null;
  kind: BackupSetKind | null;
  publish: number | null; // null: the snapshot has no `publish-` tag
  legacySet: number | null; // key snapshots only
  provenFrom: number | null; // key snapshots only
}

type PairRelation = 'same-publish' | 'older-data';

type PairRefusal =
  | 'no-key-snapshot'
  | 'no-data-of-publish'
  | 'duplicate-publish'
  | 'no-such-data-snapshot'
  | 'data-newer-than-keys'
  | 'data-unproven';

type BackupPairPick =
  | { key: PublishedSnapshot; data: PublishedSnapshot; relation: PairRelation }
  // The text of each `message` is not written (open: refusal texts). The message of
  // `no-data-of-publish` holds the ID of the data snapshot with the highest publish number that
  // the key copy vouches for.
  | { refused: PairRefusal; message: string };

declare function pickNewestKey(keys: readonly PublishedSnapshot[]): PublishedSnapshot | null;

declare function pickBackupPair(
  keys: readonly PublishedSnapshot[],
  data: readonly PublishedSnapshot[],
  dataSnapshotID: string | null, // null: the default data snapshot
): BackupPairPick;

const fetchRepickLimit = 3; // the fetch picks again at most 3 times. A fourth change of the newest key snapshot fails the step `pick`.

// ---- D. The files a fetch and a restore write ----
// The wire lib owns all 3 names and both schemas, because the backup job and nixie both touch
// them.

const unfinishedBackupMarker = 'backup-incomplete'; // the name that `nixie backup --to` writes

// `fetched-pair.json`, at the root of the fetch's directory. A strict object at format 1.
interface FetchedCopy {
  snapshotID: string;
  publish: number | null;
  set: number | null;
  writtenAt: number;
}

interface FetchedPair {
  format: 1;
  fetchedAt: number;
  key: FetchedCopy;
  data: FetchedCopy;
  relation: PairRelation;
}

// `restore-note.json`, at the root of the staging folder. A strict object at format 1.
// The name is not 12 digits, so the backup job and nixie read it as no set.
interface RestoreNote {
  format: 1;
  restoredAt: number;
  keySnapshotID: string | null; // null: the directory came from no fetch
}

// ---- E. Log lines and command output of the backup job ----

interface BackupFetchedLine {
  event: 'backup.fetched';
  dataSnapshotID: string;
  keySnapshotID: string;
  dataSet: number | null;
  keySet: number | null;
  dataPublish: number | null;
  keyPublish: number | null;
  relation: PairRelation;
}

interface BackupFetchFailedLine {
  event: 'backup.fetch_failed';
  step: 'pick' | string; // only `pick` is settled (open: fetch step names)
  refusal?: PairRefusal; // only when the step `pick` refused
}

// `nixie-backup snapshots` prints one JSON line a snapshot.
interface SnapshotLine {
  repository: 'data' | 'key'; // the 2 values are not settled (open: fetch step names)
  snapshotID: string;
  time: string; // restic's time
  set: number | null;
  kind: BackupSetKind | null;
  publish: number | null;
}

// Exit codes of `nixie-backup fetch`: 0 after `backup.fetched`, 1 after `backup.fetch_failed` and
// for a `--to` directory that exists and is not empty.

// ---- F. restoreDataBackup ----
// In the log module. The code's `DataRestoreOptions` holds `storage`, `dataDir` and `directory`,
// and the function returns `DataRestore | DataRefusal`. The design adds 2 options and one result
// member (open: restore result).

interface DataRestoreOptions {
  storage: DataStorage;
  dataDir: string;
  directory: string;
  hold: boolean; // false: the restore ends in the state `none`
  // Read only when the pair's relation is `older-data`. No flag and no config key sets it.
  // The value that `nixie restore` passes is not decided (open: forgottenItems value).
  forgottenItems: 'leave-unreadable' | 'finish-forgets';
}

interface DataRestore {
  files: readonly DataFile[];
  pair: FetchedPair | null; // null: the directory came from no fetch
}

declare function restoreDataBackup(options: DataRestoreOptions): Promise<DataRestore | DataRefusal>;

// The last line that `nixie restore` prints says that recovered work waits for a hold release
// and names `nixie recovery`. Its text is not written (open: refusal texts).

// ---- G. The restore marker ----
// In the log module, which owns the marker `restore-incomplete`, its 3 states and its payload.

type RestoreState = 'none' | 'replacing' | 'holding';

const restoreMoves: Record<RestoreState, readonly RestoreState[]> = {
  none: ['replacing'],
  replacing: ['replacing', 'holding', 'none'],
  holding: ['replacing', 'none'],
};

// The payload of a marker in the state `holding`.
interface PendingRestore {
  version: 1;
  recoveryID: string; // random, made by the restore
  restoredAt: number;
  backupTakenAt: number; // the time of the record with the highest sequence in the staged nixie.db
  // relation: PairRelation | null; only with the finish of forgets (open: finish-forgets place)
}

interface StartWriterOptions /* the code's members, and: */ {
  installsRecoveryHolds?: boolean; // only the server passes true
}

interface Writer /* the code's members, and: */ {
  pendingRestore: PendingRestore | null;
}

// ---- H. The migration ----
// One migration appended to `nixieSchema`. The schema's `oldestReader` has the value it has
// without this migration.

const recoveryHoldMigration = `
create table recovery_holds (
  subject_key     text primary key,     -- 'task:<id>' or 'launch_source:<id>'
  subject_kind    text not null,
  subject_id      text not null,
  recovery_id     text not null,
  cause           text not null,        -- 'restore' or 'rollback'
  placed_sequence integer not null references records (sequence)
) strict;

create table recoveries (
  recovery_id      text primary key,
  cause            text not null,
  started_at       integer not null,
  backup_taken_at  integer,
  started_sequence integer not null references records (sequence)
) strict;

alter table schema_version add column open_oldest_reader integer; -- null while no recovery hold exists
`;

// ---- I. Record kinds ----
// The tasks module owns all 3. None is an inbox kind, and the tasks projection folds none.

type RecoveryCause = 'restore' | 'rollback';

type HoldSubject = { kind: 'task'; id: string } | { kind: 'launch_source'; id: string };

interface RecoveryStarted {
  kind: 'recovery.started'; // on no thread
  payload: {
    recoveryID: string;
    cause: RecoveryCause;
    startedAt: number;
    backupTakenAt: number | null;
  };
}

interface RecoveryHoldPlaced {
  kind: 'recovery.hold_placed'; // on the task's thread, or on no thread for a launch source
  payload: {
    subject: HoldSubject;
    recoveryID: string;
    cause: RecoveryCause;
    stateAtBackup?: TaskState; // read by recovery/read only
    wasRunning?: boolean; // read by recovery/read only
  };
}

interface RecoveryHoldReleased {
  kind: 'recovery.hold_released'; // on the same thread as the placed record
  payload: { subject: HoldSubject; recoveryID: string; by: string }; // by: the identity that answered
}

// ---- J. The reader gate ----
// In the db lib.

declare function closeToOlderReaders(tx: Transaction, reader: number): Promise<void>;
declare function reopenToOlderReaders(tx: Transaction): Promise<void>;
declare function syncRecoveryHoldGate(/* at each start */): Promise<void>;

// ---- K. The claim check ----
// In the tasks module. `ClaimRequest` has `kind`, `holder`, `durationMs`, `readCandidate` and
// `onClaim` in the code, and `readCandidate` returns `string | null` there.

interface ClaimCandidate {
  workID: string;
  subjects: readonly [HoldSubject, ...HoldSubject[]]; // every subject whose recovery hold stops the claim
}

interface ClaimRequest /* kind, holder, durationMs, onClaim, and: */ {
  readCandidate: (tx: Transaction, now: number) => Promise<ClaimCandidate | null>;
}

declare function buildRecoveryHoldCheck(
  eb: ExpressionBuilder,
  kind: HoldSubject['kind'],
  idColumn: string,
): Expression<SqlBool>;

// Exported by the tasks module. It takes the caller's transaction.
declare function isRecoveryHeld(tx: Transaction, subject: HoldSubject): Promise<boolean>;

// ---- L. Place, install and hold release ----
// In the tasks module.

interface PlacedHolds {
  recoveryID: string;
  held: number;
  isNew: boolean; // false: the `recoveries` row existed, and the call wrote nothing
}

declare function placeRecoveryHoldsInTransaction(
  tx: Transaction,
  context: TasksContext,
  request: {
    recoveryID: string;
    cause: RecoveryCause;
    startedAt: number;
    backupTakenAt: number | null;
    subjects: readonly HoldSubject[];
  },
): Promise<PlacedHolds>;

declare function installRestoreHolds(
  context: TasksContext,
  options: {
    pending: PendingRestore | null;
    exemptTaskIDs: readonly string[];
    readTasksWithPendingActions: (tx: Transaction) => Promise<readonly string[]>;
    readLaunchSources: (tx: Transaction) => Promise<readonly string[]>; // returns none
    // finishForgets?: (tx: Transaction) => Promise<number>; (open: finish-forgets place)
  },
): Promise<PlacedHolds | null>; // null: no restore is pending

declare function releaseRecoveryHolds(
  context: TasksContext,
  request: {
    subjects: 'all' | readonly HoldSubject[]; // no API procedure and no command passes "all"
    by: string;
  },
): Promise<{ released: readonly HoldSubject[]; left: number }>;

// A constant of the server app: the tasks that a restore never holds (open: held tasks).
const restoreExemptTaskIDs = ['memory-writer', 'memory-consolidator'];

// ---- M. The start part and its fault points ----

const recoveryHoldsPart = {
  name: 'recovery_holds', // the start part `recovery` lists it in its `needs`
};

type RecoveryHoldFaultPoint =
  | 'recovery.holds.committed' // after the commit of the holds and the closed gate
  | 'recovery.holds.marker_cleared'; // after the marker is removed

// ---- N. API and host commands ----

// recovery/read, for a signed-in session.
interface RecoveryRead {
  // When the answer is null is not settled (open: recovery read null).
  recovery: null | {
    restoredAt: Date;
    backupTakenAt: Date; // the time of the record with the highest sequence in the restored log
    held: {
      taskID: string;
      name: string;
      stateAtBackup: TaskState;
      wasRunning: boolean; // a step had started and had not committed
      unknownActions: number; // attempts that the start part `recovery` marked unknown
    }[];
  };
}

// tasks/release, a checked action. It returns the task's state, as each task control does.
interface TaskReleaseInput {
  clientActionID: string;
  taskID: string;
}

// Error: `TASK_NOT_HELD`, status 409, for a task with no recovery hold. Its message is not
// written (open: refusal texts).

// tasks/list and tasks/read: each task has `isHeld: boolean`.

// Host commands:
//   nixie recovery                 prints the output of recovery/read as JSON
//   nixie task-release <task_id>   releases one task's recovery hold and prints the task's state

// ---- O. The restore notice ----
// One inbox record on the conversation's thread (open: restore notice).

interface RecoveryNotice {
  kind: 'recovery.notice';
  payload: { recoveryID: string; restoredAt: number; backupTakenAt: number };
}

// Its system message type is `restore`, a member of `SystemMessageType`. Code builds the one
// sentence pair from the payload. With a restore on 3 March at 09:12 from a backup taken on
// 3 March at 03:00, the agent reads:
const restoreNoticeExample =
  'nixie was restored on 3 March at 09:12 from a backup taken on 3 March at 03:00. The log holds nothing after that time.';

// ---- P. Seeders ----
// Each module exports one builder from its test utils, with one file a test seed and a test
// beside each file.

declare function buildActionSeeder(deps: SeederDeps): {
  action: Seed; // pending
  doneAction: Seed;
  failedAction: Seed;
  unknownAction: Seed; // one test seed for each ActionStatus
};

declare function buildTaskSeeder(deps: SeederDeps): Record<string, Seed>; // one for each TaskState that a create does not give
declare function buildMemorySeeder(deps: SeederDeps): Record<string, Seed>; // items and proposals: one for each value of each state type
declare function buildConnectorSeeder(deps: SeederDeps): Record<string, Seed>; // holds the web fetch links seed
declare function buildBackupSeeder(deps: SeederDeps): Record<string, Seed>; // holds the failed backup notice seed
// The module that writes `identities` publishes the identity seeds (open: identities writer).

// One for each package whose tests seed another module's records: the API module, the sessions
// module, the server app, `integration` and `e2e`. Each `setupTest()` there returns
// `seed: buildSeeder(deps)`.
declare function buildSeeder(deps: SeederDeps): Record<string, Seed>;

// Each module's package.json has this one export for its test utils, and no export a file:
//   "./test-utils": "./src/test-utils/index.ts"

// ---- Q. The lint config ----
// In `.oxlintrc.json`, under "rules":
//   "zgeoff/seed-only": "error",
//   "zgeoff/test-beside-seed": "error",
// `zgeoff/function-verb` runs as an error in the code, and the config release adds its `seed`
// clause.
