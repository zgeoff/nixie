import type { BackupSchedule, ForgetBackup } from '@heynixie/backup';
import type { ComputerTakeover, WatchConnection, WatchSocket } from '@heynixie/connectors';
import type { DefinitionNotice, ImageMediaType } from '@heynixie/contract';
import type { CheckedTables } from '@heynixie/db';
import type { DefinitionsContext } from '@heynixie/definitions';
import type { RecordKind } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type {
  HostMemoryStore,
  ItemIDStore,
  MemoryProposals,
  MemoryStore,
  MomentStore,
} from '@heynixie/memory';
import type { NotebookStore } from '@heynixie/notebook';
import type { PromptsInForce } from '@heynixie/prompts';
import type { QuietHours } from '@heynixie/proposals';
import type { SpendContext } from '@heynixie/spend';
import type { TaskProfile, TasksContext } from '@heynixie/tasks';
import type { ReadZone } from '@heynixie/triggers';
import type { TurnInputs } from '@heynixie/turn-inputs';
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins';
import type { Kysely } from 'kysely';
import type { WatchTickets } from './computer/create-watch-tickets';
import type { ClientRegistry } from './live/create-client-registry';
import type { PasskeyState } from './passkey/passkey-state';

export interface APISettings {
  readonly enrolmentCodeLifetimeMs: number;

  readonly sessionIdleMs: number;

  // how long one passkey tap covers every other passkey check of the same session
  readonly passkeyWindowMs: number;

  readonly refusalIntervalMs: number;

  readonly lastSeenIntervalMs: number;

  // SHA-256 hashes, in hex, of the tokens that may make only the reads of a read-only caller
  readonly readOnlyTokenHashes: readonly string[];

  readonly isBackupEnabled: boolean;

  readonly taskDirectory: readonly TaskProfile[];

  readonly approvals?: {
    readonly defaultMinutes: number;
    readonly eveningAt: string;
    readonly morningAt: string;
    readonly quietHours: QuietHours | null;
    readonly defaultZone: string;
  };

  // the policy settings of proposed rules and mandates
  readonly policy?: {
    readonly proposedRules: {
      readonly approvals: number;
      readonly windowDays: number;
      readonly quietDays: number;
    };
    readonly mandates: { readonly maxHours: number };
  };
}

export interface OwnerImage {
  readonly mediaType: ImageMediaType;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

interface ForgottenRecord {
  readonly recordSequence: number;
}

// The start sequence runs the cleanup again for a forget that a crash cut short, so the cleanup must
// be safe to rerun.
export type CleanupRecordSessions = (cause: ForgottenRecord) => Promise<void>;

// What the API needs to let a browser watch the computer's desktop.
export interface ComputerWatchPort {
  readonly tickets: WatchTickets;
  readonly logger: Logger;

  // Opens a watch for a socket. Null before the computer starts, and where the server holds none.
  readonly readWatch: () => ((socket: WatchSocket, deviceID: string) => WatchConnection) | null;

  // The hold on the desktop that a device session takes and gives back. Null before the computer
  // starts, and where the server holds none.
  readonly readTakeover: () => Pick<ComputerTakeover, 'start' | 'end'> | null;
}

// A forget open past the stuck threshold, as the owner and the model read it
export interface StuckForget {
  readonly kind: string;
  readonly shortID: string | null;
  readonly openForMs: number;
}

export interface ErasureStuckPort {
  readonly readStuck: () => Promise<readonly StuckForget[]>;

  // runs each stuck forget again, and returns the ones still open afterwards
  readonly retryStuck: () => Promise<readonly StuckForget[]>;
}

export interface APIContext extends TasksContext {
  readonly settings: APISettings;

  // the gateway's spending stop; absent when the deployment sets no spendStop
  readonly spend?: SpendContext;

  // presence and the open device streams, which a restart drops
  readonly clients: ClientRegistry;

  // the server's own log, which a page event that a limit drops writes a line to; absent, the
  // server holds none
  readonly logger?: Logger;

  // challenges, registration options and the host code, which a restart drops
  readonly passkeys: PasskeyState;

  // resolves 'owner' to the zone of the newest message, or to the configured default
  readonly readZone: ReadZone;

  readonly readSessionCleanup: () => CleanupRecordSessions | null;

  // absent, the server holds no computer to watch
  readonly computerWatch?: ComputerWatchPort;

  // The erasure runner's stuck forgets, which start after the API context. Null before they start,
  // and absent where the server holds none.
  readonly readErasure?: () => ErasureStuckPort | null;

  // The notebook, which starts after the API context. Null before it starts, and absent where the
  // server holds none.
  readonly readNotebook?: () => ViewNotebookStore | null;

  // the notice of each named change, by change ID, in the owner's zone at read time
  // Absent, no record carries a notice.
  readonly readDefinitionNotices?: (
    db: Kysely<unknown>,
    changeIDs: readonly string[],
  ) => Promise<ReadonlyMap<string, DefinitionNotice>>;

  // Destroys the code sandboxes of the tool calls that the records name, and throws when one will
  // not go. A forget runs it before it deletes any key. Null, or absent, means the server holds no
  // code tool.
  readonly readCodeCleanup?: () => ((sequences: readonly number[]) => Promise<void>) | null;
}

export type HostTurnInputs = Pick<TurnInputs, 'list' | 'open' | 'set'>;

export interface HostRouterOptions {
  readonly context: APIContext;

  // the turn-input log; with none, its procedures answer NOT_CONFIGURED
  readonly turnInputs?: HostTurnInputs;

  readonly readMemory: ReadHostMemory;

  readonly readBackups: ReadHostBackups;

  readonly runReset: () => Promise<HostReset>;
  readonly runConversationReset: () => Promise<HostConversationReset>;

  readonly runInForceSeed: () => Promise<void>;

  // the context of a runtime change of a task definition; null before the server holds its parts
  readonly readDefinitions: () => DefinitionsContext | null;

  readonly readInForce: () => PromptsInForce | null;
  readonly wakeExports: () => void;

  readonly gate: HostCallGate;
}

interface HostCallGate {
  readonly runCall: <T>(call: () => Promise<T>, onClosed: () => Promise<T>) => Promise<T>;
}

export type ReadHostMemory = () => HostMemoryStore | null;

export type HostBackups =
  | { readonly state: 'off' }
  | { readonly state: 'on'; readonly schedule: Pick<BackupSchedule, 'stage'> };

// null until the backups part has started
export type ReadHostBackups = () => HostBackups | null;

export type ViewMemoryStore = Pick<
  MemoryStore,
  | 'view'
  | 'retire'
  | 'restore'
  | 'undo'
  | 'keep'
  | 'pin'
  | 'forget'
  | 'forgetRetired'
  | 'finishForgets'
> & {
  readonly proposals: Pick<MemoryProposals, 'approve' | 'reject'>;
  readonly moments: Pick<
    MomentStore,
    | 'keep'
    | 'edit'
    | 'link'
    | 'readMatches'
    | 'readView'
    | 'readDestroyPreview'
    | 'beginDestroy'
    | 'finishDestroy'
    | 'readDestroyedSequence'
  >;
} & Pick<ItemIDStore, 'readItemIDMap'>;

export type ReadViewMemory = () => ViewMemoryStore | null;

// What the web client's notebook calls reach.
export type ViewNotebookStore = Pick<
  NotebookStore,
  | 'listNotes'
  | 'readClientNote'
  | 'readClientCheck'
  | 'readPrivateBodies'
  | 'writeOpened'
  | 'readForgetPreview'
  | 'beginForget'
  | 'finishForget'
  | 'readForgottenSequence'
  | 'readLinkingNotes'
>;

interface HostReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly keptSessions: number;
}

export type ForgetBackupState =
  | ForgetBackup
  | { readonly state: 'off' }
  | { readonly state: 'unknown' };

export type ForgetProgress =
  | { readonly stage: 'deleting' }
  | { readonly stage: 'forgotten'; readonly sequence: number | null };

interface HostConversationReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly shreddedRecords: number;
  readonly backup: ForgetBackupState;
}

export interface APIRequestContext extends ResponseHeadersPluginContext {
  readonly sessionToken: string | undefined;
  readonly tokenSource: 'bearer' | 'cookie' | 'none';

  // the Origin header of the call
  readonly origin?: string | undefined;
}

export type SessionScope = 'full' | 'device';

export interface Identity {
  readonly identityID: string;
  readonly channel: string;
  readonly scope: SessionScope;
  readonly label: string;
  readonly pairedAt: number;
  readonly lastSeenAt: number;
}

interface IdentityRow {
  readonly identity_id: string;
  readonly channel: string;
  readonly external_id: string;
  readonly label: string;
  readonly token_hash: string | null;
  readonly paired_at: number;
  readonly last_seen_at: number;
  readonly revoked_at: number | null;
  readonly paired_sequence: number;
  readonly scope: SessionScope;
}

interface EnrolmentCodeRow {
  readonly code_hash: string;
  readonly issued_at: number;
  readonly expires_at: number;
  readonly issued_by: string | null;
  readonly used_at: number | null;
  readonly identity_id: string | null;
  readonly scope: SessionScope;
}

interface ClientActionRow {
  readonly client_action_id: string;
  readonly procedure: string;
  readonly identity_id: string | null;
  readonly input_hash: string | null;
  readonly result: string;
  readonly recorded_at: number;
}

interface RefusalRow {
  readonly refusal_key: string;
  readonly refused_at: number;
  readonly refused_sequence: number;
}

interface TaskRow {
  readonly task_id: string;
  readonly state: string;
}

interface RecordRow {
  readonly sequence: number;
  readonly thread: string | null;
  readonly kind: RecordKind;
  readonly parent: number | null;
  readonly recorded_at: number;
  readonly payload: string;
  readonly key_id: string | null;
}

interface PasskeyRow {
  readonly passkey_id: string;
  readonly credential_id: string;
  readonly public_key: Uint8Array<ArrayBuffer>;
  readonly user_handle: Uint8Array<ArrayBuffer>;
  readonly rp_id: string;
  readonly origin: string;
  readonly sign_count: number;
  readonly backup_eligible: number;
  readonly backed_up: number;
  readonly transports: string;
  readonly aaguid: string;
  readonly label: string;
  readonly registered_by: string;
  readonly authorized_by: string;
  readonly registered_at: number;
  readonly last_used_at: number | null;
  readonly revoked_at: number | null;
}

interface ThreadRow {
  readonly thread: string;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type APITables = CheckedTables<
  Readonly<{
    identities: IdentityRow;
    enrolment_codes: EnrolmentCodeRow;
    client_actions: ClientActionRow;
    refusals: RefusalRow;
    tasks: TaskRow;
    records: RecordRow;
    threads: ThreadRow;
    passkeys: PasskeyRow;
  }>,
  'tasks' | 'records' | 'threads' | 'passkeys'
>;
