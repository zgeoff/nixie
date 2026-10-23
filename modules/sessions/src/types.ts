import type { CompactionSettings } from '@heynixie/compaction';
import type { ContentSource, RecordInput } from '@heynixie/log';
import type { ResolvedProfile } from '@heynixie/models';
import type { PromptOverrides } from '@heynixie/prompts';
import type { GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import type { RunEndpoint, ToolRunModel } from '@heynixie/tools';
import type { SessionPoint, TurnProfile } from '@heynixie/wire';
import type { StatusRegistry } from './build-status-registry';
import type { SessionGuard } from './make-session-guard';
import type { SessionMarks } from './read-session-marks';

export interface MemoryRef {
  readonly itemID: string;
  readonly version: number;
}

export type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'memory_writer' | 'lapse';

export interface MemoryItem extends MemoryRef {
  readonly shortID: string;

  readonly subject: 'owner' | 'self' | 'shared';
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;

  readonly model: string | null;

  readonly recordedAt: number;

  readonly evidenceQuote: string | null;

  readonly approval: MemoryApproval | null;
}

export interface MemoryApproval {
  readonly isQuotePasted: boolean;
}

export interface MemoryLineOptions extends MessageTimeOptions {
  readonly ownerName: string | null;
}

interface MemoryRetrieval {
  readonly query: string;
  readonly limit: number;
  readonly selfNoteLimit: number;
  readonly minScore: number;
  readonly minSimilarity: number;

  readonly excludePinned: true;

  readonly excludedVersions: readonly MemoryRef[];

  readonly excludedWords: readonly string[];

  readonly thread: string;
}

interface MessageRetrieval {
  readonly query: string;
  readonly limit: number;
  readonly minScore: number;
  readonly minSimilarity: number;

  readonly excludedSequences: readonly number[];
  readonly excludedWords: readonly string[];
}

export interface PastMessage {
  readonly sequence: number;
  readonly thread: string | null;
  readonly recordedAt: number;
  readonly text: string;
  readonly isCut: boolean;
}

export interface PinnedCoreUse {
  readonly items: number;
  readonly tokens: number;
  readonly budget: number;
}

export interface ConversationMemory {
  readonly readPinnedCore: () => Promise<readonly MemoryItem[]>;
  readonly readPinnedCoreUse: () => Promise<PinnedCoreUse>;
  readonly recall: (request: MemoryRetrieval) => Promise<{ readonly items: readonly MemoryItem[] }>;

  readonly recallMessages: (
    request: MessageRetrieval,
  ) => Promise<{ readonly messages: readonly PastMessage[] }>;

  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

export interface ConversationMemorySettings {
  readonly retrievalItems: number;

  readonly retrievalSelfNotes: number;

  readonly retrievalMessages: number;

  readonly retrievalMinScore: number;

  readonly retrievalMinSimilarity: number;

  readonly rebuildTokens: number;

  readonly ownerName: string | null;

  readonly agentNames: readonly string[];
}

export interface MessageTimeOptions {
  readonly defaultZone: string;
  readonly now: Date;
}

export interface ImageTally {
  readonly bytes: number;
  readonly count: number;
}

export type SessionCleanupCause = { readonly itemID: string } | { readonly recordSequence: number };

export interface SessionDefinitions {
  readonly persona: string;
  readonly prompts: PromptOverrides;
  readonly personaHash: string;
  readonly policyHash: string;
}

export interface ConversationRun {
  readonly context: TasksContext;
  readonly profile: ResolvedProfile;

  readonly turnProfile: TurnProfile;
  readonly sandbox: Sandbox;

  readonly endpoint: Pick<RunEndpoint, 'startStep'>;
  readonly model: ToolRunModel;
  readonly command: GuestCommand;

  readonly getDefinitions: () => SessionDefinitions;

  readonly loadOrPinSkillCatalog?: (taskID: string) => Promise<string | null>;

  readonly readTurnNote?: (request?: TurnNoteRequest) => Promise<TurnNote>;

  readonly status: StatusRegistry;

  readonly memory: () => ConversationMemory;
  readonly memorySettings: ConversationMemorySettings;
  readonly compaction: CompactionSettings;

  readonly defaultZone: string;

  readonly session: SessionGuard;
}

export type SessionState =
  | 'fresh'
  | 'summarized'
  | 'resumable'
  | 'compaction-due'
  | 'invalidated'
  | 'lost';

type LiveSessionState = Extract<SessionState, 'resumable' | 'compaction-due'>;

export type SessionEvent = 'open' | 'resume' | 'compact';

export interface LiveSessionPosition {
  readonly state: LiveSessionState;
  readonly boundary: SessionPoint;
}

type InvalidationCause = 'forget' | 'persona';

export type SessionPosition =
  | LiveSessionPosition
  | {
      readonly state: 'invalidated';
      readonly boundary: SessionPoint | null;
      readonly cause: InvalidationCause;
    }
  | {
      readonly state: Exclude<SessionState, LiveSessionState | 'invalidated'>;
      readonly boundary: SessionPoint | null;
    };

export interface SessionStep {
  readonly run: ConversationRun;
  readonly input: StepInput;
  readonly definitions: SessionDefinitions;

  readonly skillCatalog: string | null;
  readonly signal: AbortSignal;
  readonly marks: SessionMarks;
  readonly position: SessionPosition;
}

export interface InboxPlan {
  readonly canCompact: boolean;
  readonly before: readonly RecordInput[];
}

export interface TurnNote {
  readonly text: string | null;
  readonly throughSequence: number;

  readonly eventCount: number;
}

export type SessionStart =
  | { readonly kind: 'first' }
  | { readonly kind: 'compaction' }
  | {
      readonly kind: 'rebuild';
      readonly reason: 'lost' | InvalidationCause | 'images';
      readonly lostSessionID: string | null;
    };

export interface TurnNoteRange {
  readonly after: number;
  readonly through: number;
}

export interface TurnNoteRequest {
  readonly span?: TurnNoteRange;
  readonly isNewSession?: boolean;
}

export interface NotedEvent<Detail> {
  readonly sequence: number;

  readonly at: number;
  readonly detail: Detail;
}

export interface EventSettings {
  readonly ownerName: string | null;

  readonly timeZone: string;
}

export interface EventKind<Detail> {
  readonly name: string;
  readonly read: (range: TurnNoteRange) => Promise<readonly NotedEvent<Detail>[]>;

  readonly complete?: (
    events: readonly NotedEvent<Detail>[],
  ) => Promise<readonly NotedEvent<Detail>[]>;
  readonly render: (detail: Detail, settings: EventSettings) => string;

  readonly isUncapped?: boolean;

  readonly isSessionBound?: boolean;
}

export interface ReadEvent {
  readonly kind: string;
  readonly sequence: number;
  readonly at: number;
}

export interface BoundEvent {
  readonly sequence: number;
  readonly at: number;
  readonly render: (settings: EventSettings) => string;
}

export type EventRegistry = readonly {
  readonly name: string;
  readonly read: (range: TurnNoteRange) => Promise<readonly ReadEvent[]>;
  readonly complete: (events: readonly ReadEvent[]) => Promise<readonly BoundEvent[]>;
  readonly isUncapped: boolean;
  readonly isSessionBound: boolean;
}[];

export type GuestEntry = 'check' | 'main';
