import type { CompactionSettings } from '@heynixie/compaction';
import type { ContentSource, LogRecord, RecordInput } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { Harness, ResolvedProfile } from '@heynixie/models';
import type { PromptOverrides } from '@heynixie/prompts';
import type { GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { SpendContext } from '@heynixie/spend';
import type { StepInput, TaskMessaging, TaskReport, TasksContext } from '@heynixie/tasks';
import type {
  ApprovedCallRequest,
  ApprovedReply,
  ApprovedRun,
  RunEndpoint,
  ToolRunModel,
} from '@heynixie/tools';
import type { InboxMessage, ModelCallUsage, SessionPoint, TurnProfile } from '@heynixie/wire';
import type { StatusRegistry } from './session/build-status-registry';
import type { SessionGuard } from './utils/make-session-guard';
import type { StepCapturePort } from './utils/open-step-capture';
import type { SessionMarks } from './utils/read-session-marks';

export interface MemoryRef {
  readonly itemID: string;
  readonly version: number;
}

export type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'lapse';

export interface MemoryItem extends MemoryRef {
  readonly shortID: string;

  // the text version plus the approved label edits, which a line shows as its version
  readonly revision: number;

  readonly subject: 'owner' | 'self' | 'shared';
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;

  readonly model: string | null;

  readonly recordedAt: number;

  readonly evidenceQuote: string | null;

  readonly approval: MemoryApproval | null;

  // true for a version a purge wrote, which no one noted or said
  readonly isBridge?: boolean;

  // how many notes of the notebook dispute or supersede the item, set above 0 on a retrieved item
  readonly disputedBy?: number;
  readonly supersededBy?: number;
}

export interface MemoryApproval {
  readonly isQuotePasted: boolean;
}

export interface MemoryLineOptions extends MessageTimeOptions {
  readonly ownerName: string | null;
}

export interface PinnedCoreUse {
  readonly items: number;
  readonly tokens: number;
  readonly budget: number;
}

export interface SessionIndex {
  // the block's text; '' when the block is omitted
  readonly text: string;

  // the active items that are not pinned
  readonly items: number;

  // the block's counted tokens
  readonly tokens: number;

  // the index's token budget
  readonly budget: number;
}

export interface TurnMemoryAsk {
  readonly text: string;
  readonly thread: string;
  readonly excludedWords: readonly string[];

  // what the session holds, which no push picks again
  readonly held: SessionHeld;
}

export interface SessionHeld {
  // each read is lazy: the memory module calls it only when it needs the answer
  readonly readVersions: () => Promise<readonly MemoryRef[]>;
}

export type TurnMemory =
  | {
      readonly kind: 'placed';
      readonly items: readonly MemoryItem[];
      readonly selfNotes: readonly MemoryItem[];
    }
  | { readonly kind: 'none' };

export interface ConversationMemory {
  readonly readIndex: () => Promise<SessionIndex>;
  readonly readPinnedCore: () => Promise<readonly MemoryItem[]>;
  readonly readPinnedCoreUse: () => Promise<PinnedCoreUse>;
  readonly readTurnMemory: (ask: TurnMemoryAsk) => Promise<TurnMemory>;
  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

export interface ConversationMemorySettings {
  readonly rebuildTokens: number;

  readonly ownerName: string | null;

  readonly agentNames: readonly string[];
}

export interface MessageTimeOptions {
  readonly defaultZone: string;
  readonly now: Date;
}

// What the element that starts a turn tells the model: each gap shows in short units, and is null
// when there is nothing to measure from.
export interface TurnGaps {
  readonly sinceYourLastTurn: string | null;
  readonly sinceOwnerLastWrote: string | null;
}

// Reads the gaps for the record that starts a turn, or that cuts into one, at the time of the call.
export type GapReader = (record: LogRecord) => Promise<TurnGaps>;

export interface ImageTally {
  readonly bytes: number;
  readonly count: number;
}

export type SessionCleanupCause =
  | { readonly itemID: string }
  | { readonly recordSequence: number }
  | { readonly momentID: string }
  | { readonly noteID: string };

export interface SessionDefinitions {
  readonly persona: string;
  readonly prompts: PromptOverrides;
  readonly personaHash: string;
  readonly policyHash: string;
}

export type SessionFrame =
  | { readonly kind: 'conversation' }
  | { readonly kind: 'task'; readonly startedBy: string; readonly report: TaskReport };

interface TurnBudget {
  readonly getLeftDollars: () => number;
  readonly onSpend: (dollars: number) => void;
}

export interface InStepSettled {
  // the sequence of the outcome record that the action wrote
  readonly outcomeSequence: number;

  // what the call returned, or null for a call that did not run
  readonly reply: ApprovedReply | null;
}

export interface InStepActions {
  // whether the task holds an approved call that its next step has to run
  readonly probePending: (taskID: string) => Promise<boolean>;

  // runs each such call under the step's lease, through the step's own tool run
  readonly run: (request: InStepRunRequest) => Promise<readonly InStepSettled[]>;

  // What each call that ran returned, by the sequence of its outcome record, which a later turn
  // reads when its batch ends before the outcome. A restart empties it, and a turn then reads what
  // the result record kept.
  readonly replies: Map<number, ApprovedReply>;
}

export interface InStepRunRequest {
  readonly lease: StepInput['lease'];
  readonly runCall: (request: ApprovedCallRequest) => Promise<ApprovedRun>;
}

export interface ConversationRun {
  readonly context: TasksContext;
  readonly frame: SessionFrame;

  // the log the session reads starts after this sequence, which gives a fresh session to each task
  // run of a definition's task
  readonly sinceSequence?: number;
  readonly profile: ResolvedProfile;

  readonly harness: Harness;

  // the harness's turn profile for a kept session, with the capture's base URL once a step opens one
  readonly turnProfile: TurnProfile;
  readonly sandbox: Sandbox;

  readonly endpoint: Pick<RunEndpoint, 'startStep' | 'runApproved'>;

  // The approved calls of the tools that run inside the turn, which the step runs before its turn.
  // Absent, no step runs one.
  readonly inStepActions?: InStepActions;

  // set with spendStop: the step checks the turn count and the stop before its turn
  readonly spend?: SpendContext;
  readonly model: ToolRunModel;
  readonly command: GuestCommand;

  // the most model API calls one turn makes; a turn with no limit runs until the model ends it
  readonly modelCallLimit?: number;
  readonly onModelCall?: (usage: ModelCallUsage) => Promise<void>;

  // the dollar budget the turn runs under, which its workers draw from; a conversation turn has
  // none
  readonly budget?: TurnBudget;

  // the turn-input log: each step of the run opens a capture and closes it at its end
  readonly turnInputs?: StepCapturePort;

  readonly getDefinitions: () => SessionDefinitions;

  readonly loadOrPinSkillCatalog?: (taskID: string) => Promise<string | null>;

  readonly readTurnNote?: (request?: TurnNoteRequest) => Promise<TurnNote>;

  readonly status: StatusRegistry;

  readonly memory?: () => ConversationMemory;
  readonly memorySettings: ConversationMemorySettings;
  readonly compaction: CompactionSettings;

  readonly defaultZone: string;

  readonly messaging: TaskMessaging;

  readonly imageBudget: ImageTally;

  readonly session: SessionGuard;

  // empties the web fetch pause of every host; a forget runs it so a host name outlives no session
  readonly clearFetchPauses: () => void;

  readonly log: Logger;
}

export type SessionState =
  | 'fresh'
  | 'summarized'
  | 'resumable'
  | 'compaction-due'
  | 'invalidated'
  | 'lost'
  | 'unkept';

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

      // null: a step from unkept
      readonly reason: 'lost' | InvalidationCause | 'images' | null;
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

// A message for the running turn. cutsCall is true when it cuts the model call in flight.
export interface LiveInboxMessage {
  readonly message: InboxMessage;
  readonly cutsCall: boolean;
}
