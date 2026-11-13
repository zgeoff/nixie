import type { Clock } from '@heynixie/clock';
import type { CheckedTables, MigrationReport } from '@heynixie/db';
import type { Generated, Kysely, Selectable, Transaction } from 'kysely';

export interface Writer {
  readonly dataDir: string;
  readonly db: Kysely<unknown>;

  readonly keys: Kysely<unknown>;
  readonly epoch: number;

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

export type DestinationPermission = 'owner' | 'reply_target' | 'known_contact' | 'job' | 'rule';

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
  readonly context: 'conversation' | 'task' | 'job' | 'coding';
  readonly definitionID: string | null;
  readonly sources: readonly ('owner' | 'own_data' | 'task' | 'outside')[];
  readonly turnMessageSequence: number | null;
  readonly onBehalfOf: readonly number[];
}

export interface Decision {
  readonly outcome: 'allow' | 'ask' | 'deny';
  readonly stage: number;
  readonly rule: { readonly id: string; readonly revision: number } | null;

  // The first release wrote destinations and consent in these shapes; nothing writes them now.
  readonly destinations?: readonly {
    readonly destination: string;
    readonly permission: string | null;
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
}

export type RecordKind = keyof RecordKinds;

export interface RecordCodec<Kind extends RecordKind, Payload, PartialPayload = Partial<Payload>> {
  readonly kind: Kind;
  readonly encode: (payload: Payload) => Payload;
  readonly parse: (input: unknown) => Payload;
  readonly decode: (payload: JSONObject) => Payload;
  readonly tryDecodePartial: (payload: JSONObject) => PartialPayload | null;
}

export interface RecordInput {
  readonly kind: RecordKind;
  readonly definitions: Definitions;
  readonly thread?: string;
  readonly stepKey?: string;
  readonly parent?: number;
  readonly contentSource?: ContentSource;
  readonly decision?: Decision;
  readonly promptCause?: PromptCause;
  readonly approval?: Approval;
  readonly payload?: JSONObject;
  readonly erasable?: JSONObject;

  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];
}

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
  }>
>;

export type KeyStoreTables = Readonly<{
  record_keys: { readonly key_id: string; readonly wrapped: Uint8Array<ArrayBuffer> };
}>;
