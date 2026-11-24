import type { Clock } from '@heynixie/clock';
import type { CheckedTables, MigrationReport } from '@heynixie/db';
import type { TaskState } from '@heynixie/task-control';
import type { Generated, Kysely, Selectable, Transaction } from 'kysely';
import type { PendingRestore } from './restore/pending-restore';

export interface Writer {
  readonly dataDir: string;
  readonly db: Kysely<unknown>;

  readonly keys: Kysely<unknown>;
  readonly epoch: number;

  // The finished restore this start found, which only the server's start installs.
  readonly pendingRestore: PendingRestore | null;

  readonly clock: Clock;

  readonly commits: EventTarget;
  readonly migration: MigrationReport;
  readonly stop: () => Promise<void>;
}

export type SubscribeToChanges = (onChange: () => void) => () => void;

export interface WriterLock {
  readonly release: () => void;
}

export type ReadFilesystemType = (path: string) => { readonly type: number };

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | readonly JSONValue[]
  | { readonly [key: string]: JSONValue };

export type JSONObject = Readonly<Record<string, JSONValue>>;

export type ContentSource = 'owner' | 'owner_data' | 'untrusted';

export type PromptCause =
  | 'direct_request'
  | 'repeat'
  | 'outside_steering'
  | 'always_ask'
  | 'ask_rule'
  | 'no_rule';

export type DestinationPermission = 'owner' | 'reply_target' | 'known_contact' | 'task' | 'rule';

export type CheckerResult = 'yes' | 'no' | 'unsure' | 'unreachable';

export type DecisionFault = 'threw' | 'timed_out';

export interface ConsentCheck {
  readonly messageSequences: readonly number[];
  readonly codeCheck: 'pass' | 'fail';
  readonly checker: CheckerResult;
}

// What a replay needs beyond the call's input and destinations.
export interface DecisionInputs {
  readonly toolList: readonly string[];
  readonly context: 'conversation' | 'task' | 'coding';
  readonly definitionID: string | null;
  readonly sources: readonly ('owner' | 'own_data' | 'task' | 'outside')[];
  readonly turnMessageSequence: number | null;
  readonly onBehalfOf: readonly number[];

  // the effects a tool's prepare step set for the call, when it added to the declared ones
  readonly effects?: readonly string[];
}

export interface Decision {
  // gate: no rule decided a memory write, and the memory gate decides it
  readonly outcome: 'allow' | 'ask' | 'deny' | 'gate';
  readonly stage: number;
  readonly rule: { readonly id: string; readonly revision: number } | null;

  // The first release wrote destinations and consent in these shapes; nothing writes them now.
  readonly destinations?: readonly {
    readonly destination: string;
    readonly permission: DestinationPermission | null;
  }[];

  readonly consent?: { readonly messageSequence: number; readonly verdict: string };
  readonly autoMode?: {
    readonly verdict: string;
    readonly reason: string;
    readonly inputsHash: string;
  };

  readonly ruleOthers?: readonly string[];
  readonly cause?: PromptCause;
  readonly defect?: 'direct_request' | 'repeat';

  // one per destination, in the order of the record's erasable destinations
  readonly permissions?: readonly (DestinationPermission | null)[];

  readonly consentCheck?: ConsentCheck;
  readonly fault?: DecisionFault;
  readonly inputs?: DecisionInputs;

  // The lift of an allow rule that let a purchase through, whose charge lands when the action queues
  readonly lift?: DecisionLift;
}

export interface DecisionLift {
  readonly ruleID: string;
  readonly budgetID: string;
  readonly amountMicros: number;
}

export interface Definitions {
  readonly snapshotHash: string;
  readonly personaVersion?: string;
  readonly jobVersion?: string;
}

export interface Approval {
  readonly proposalID: string;
  readonly approvalID: string;
  readonly actionHash: string;
}

export interface RecordKinds {
  log_reset: true;
  'nixie.paused': true;
  'nixie.resumed': true;
  'nixie.task_exempted': true;
  'recovery.started': true;
  'spend.stop_tripped': true;
  'spend.stop_cleared': true;
}

export type RecordKind = keyof RecordKinds;

// A module adds each kind whose records carry erasable fields. A kind outside it takes none.
// oxlint-disable-next-line typescript/no-empty-interface -- modules merge their kinds in
export interface ErasableRecordKinds {}

export type ErasableRecordKind = Extract<RecordKind, keyof ErasableRecordKinds>;

export interface RecordCodec<Kind extends RecordKind, Payload, PartialPayload = Partial<Payload>> {
  readonly kind: Kind;
  readonly encode: (payload: Payload) => Payload;
  readonly parse: (input: unknown) => Payload;
  readonly decode: (payload: JSONObject) => Payload;
  readonly tryDecodePartial: (payload: JSONObject) => PartialPayload | null;
}

interface RecordInputFields {
  readonly definitions: Definitions;
  readonly thread?: string;
  readonly stepKey?: string;
  readonly parent?: number;
  readonly contentSource?: ContentSource;
  readonly decision?: Decision;
  readonly promptCause?: PromptCause;
  readonly approval?: Approval;
  readonly payload?: JSONObject;

  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];
}

export type RecordInput =
  | (RecordInputFields & {
      readonly kind: Exclude<RecordKind, ErasableRecordKind>;
      readonly erasable?: never;
    })
  | (RecordInputFields & {
      readonly kind: ErasableRecordKind;
      readonly erasable?: JSONObject;
    });

export interface EnvelopeRecord {
  readonly sequence: number;
  readonly recordedAt: Date;
  readonly kind: RecordKind;
  readonly definitions: Definitions;
  readonly thread: string | null;
  readonly stepKey: string | null;
  readonly parent: number | null;
  readonly contentSource: ContentSource | null;
  readonly decision: Decision | null;
  readonly promptCause: PromptCause | null;
  readonly approval: Approval | null;
  readonly payload: JSONObject;
}

export type ErasableFields =
  | { readonly status: 'none' }
  | { readonly status: 'shredded' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'readable'; readonly fields: JSONObject };

export interface LogRecord extends EnvelopeRecord {
  readonly erasable: ErasableFields;
}

export interface ProjectionChange {
  readonly projection: string;
  readonly key: string;
  readonly row: JSONObject | null;
}

export interface RecordWithChanges {
  readonly record: LogRecord;
  readonly changes: readonly ProjectionChange[];
}

export interface Projection {
  readonly table: string;
  readonly keyColumn: string;
  readonly fold: (tx: Transaction<unknown>, record: EnvelopeRecord) => Promise<readonly string[]>;

  // Runs after a rebuild commits, for state that a fold cannot read because it sits in an erasable
  // field.
  readonly afterRebuild?: (log: Log) => Promise<void>;
}

export interface Log {
  readonly writer: Pick<Writer, 'clock' | 'commits' | 'dataDir' | 'db' | 'epoch' | 'keys'>;
  readonly deploymentKey: CryptoKey;
  readonly projections: readonly Projection[];
}

interface RecordTable {
  readonly sequence: Generated<number>;
  readonly recorded_at: number;
  readonly kind: RecordKind;
  readonly thread: string | null;
  readonly step_key: string | null;
  readonly parent: number | null;
  readonly content_source: ContentSource | null;
  readonly decision: string | null;
  readonly prompt_cause: PromptCause | null;
  readonly snapshot_hash: string;
  readonly persona_version: string | null;
  readonly job_version: string | null;
  readonly proposal_id: string | null;
  readonly approval_id: string | null;
  readonly action_hash: string | null;
  readonly payload: string;
  readonly key_id: string | null;
  readonly sealed: Uint8Array<ArrayBuffer> | null;
}

export type RecordRow = Selectable<RecordTable>;

interface ThreadRow {
  readonly thread: string;
  readonly first_sequence: number;
  readonly last_sequence: number;
  readonly record_count: number;
  readonly last_recorded_at: number;
}

interface ProjectionChangeRow {
  readonly sequence: number;
  readonly projection: string;
  readonly row_key: string;
  readonly row: string | null;
}

export type PauseCause = 'restore' | 'owner' | 'spending';

export interface Pause {
  readonly cause: PauseCause;
  readonly recoveryID: string | null;
}

export interface PauseSince extends Pause {
  readonly since: number;
}

export interface TaskToCheck {
  readonly taskID: string;
  readonly stateAtBackup: TaskState;
  readonly wasRunning: boolean;
  readonly pendingActions: number;
}

// The log that writeRecordsInTransaction reads.
export type PauseLog = Log;

interface NixiePauseRow {
  readonly id: number;
  readonly cause: string;
  readonly recovery_id: string | null;
  readonly paused_sequence: number;
}

interface SpendStopRow {
  readonly id: number;
  readonly reason: string;
  readonly period: string | null;
  readonly measure: string | null;
  readonly limit_amount: number | null;
  readonly spent_amount: number | null;
  readonly at: number;
  readonly resets_at: number | null;
  readonly updated_sequence: number;
}

interface PauseExemptionRow {
  readonly task_id: string;
  readonly exempt_sequence: number;
}

interface RecoveryRow {
  readonly recovery_id: string;
  readonly restored_at: number;
  readonly backup_taken_at: number;
  readonly started_sequence: number;
}

interface RecordAttachmentRow {
  readonly sequence: number;
  readonly position: number;
  readonly sealed: Uint8Array<ArrayBuffer>;
}

export type RecordAttachments =
  | { readonly status: 'none' }
  | { readonly status: 'shredded' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'readable'; readonly attachments: readonly Uint8Array<ArrayBuffer>[] };

// These are mapped types, because Kysely's table map needs the index signature an interface lacks.
export type LogTables = CheckedTables<
  Readonly<{
    records: RecordTable;
    threads: ThreadRow;
    projection_changes: ProjectionChangeRow;
    record_attachments: RecordAttachmentRow;
    nixie_pause: NixiePauseRow;
    pause_exemptions: PauseExemptionRow;
    spend_stop: SpendStopRow;
    recoveries: RecoveryRow;
  }>
>;

export type KeyStoreTables = Readonly<{
  record_keys: { readonly key_id: string; readonly wrapped: Uint8Array<ArrayBuffer> };
}>;
