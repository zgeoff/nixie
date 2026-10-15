import type { ContentSource, RecordInput } from '@heynixie/log';
import type { Sandbox } from '@heynixie/sandbox';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import type { RunEndpoint, ToolRunModel } from '@heynixie/tools';
import type { TurnProfile } from '@heynixie/wire';
import type { StatusRegistry } from './build-status-registry';
import type { SessionGuard } from './make-session-guard';
import type { SessionMarks } from './read-session-marks';
import type { GuestCommand } from './run-guest-turn';

// The model roles, each of which names the profile it uses.
export type ModelRole =
  | 'conversation'
  | 'task'
  | 'worker'
  | 'checker'
  | 'memory-writer'
  | 'memory-consolidator';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Prices per million tokens, in the deployment's currency.
export interface ModelPrices {
  readonly input: number;

  // a write to a 5-minute cache entry, and to a 1-hour one; a profile that never asks for 1-hour
  // entries sets both to the same price
  readonly cacheWrite: number;
  readonly cacheWrite1h: number;
  readonly cachedInput: number;
  readonly output: number;
}

// A named route to one model on one Anthropic-compatible endpoint.
export interface ModelProfile {
  // a stable slug, such as chat-direct, which every record of the profile's output names
  readonly id: string;
  readonly baseURL: string;

  // a reference such as deployment:anthropic, never the credential itself
  readonly credential: string;
  readonly authHeader: 'bearer' | 'x-api-key';
  readonly model: string;
  readonly effort: ReasoningEffort;

  // the upstream provider an aggregator endpoint must keep to, so its prompt cache holds
  readonly providerPin: string | null;

  // the context window, in tokens, that the conversation's CLI compacts within instead of the
  // model's own window
  readonly contextTokens: number | null;

  // the counting proxy prices each response with them through buildCallCost, and nothing else
  // reads them
  readonly prices: ModelPrices | null;
}

// The profiles and the role map, from the deployment configuration. The conversation role is
// always set; any other role left unset uses the conversation's profile.
export interface ModelsConfig {
  readonly profiles: Readonly<Record<string, ModelProfile>>;
  readonly roles: Readonly<Partial<Record<ModelRole, string>>> & { readonly conversation: string };
}

// The part of nixie's decrypted secrets file that holds the model credentials, by name.
export interface ModelSecrets {
  readonly model_credentials?: Readonly<Record<string, string>>;
}

// A profile with its credential resolved, as a model loop starts on it.
export interface ResolvedProfile {
  readonly profile: ModelProfile;
  readonly credential: string;
}

// One version of a memory item, as a turn's record lists it.
export interface MemoryRef {
  readonly itemID: string;
  readonly version: number;
}

// Who saved a memory version: the owner in the client, the conversation, a task, or the memory
// writer.
export type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'memory_writer';

// One memory item as a turn renders it, at the version memory returned.
export interface MemoryItem extends MemoryRef {
  // the ID the model reads the item by, in place of itemID
  readonly shortID: string;
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;

  // when the version was recorded, in milliseconds since the epoch
  readonly recordedAt: number;

  // the quote the text was saved from, which a retirement carries over, or null for none
  readonly evidenceQuote: string | null;

  // the owner's approval of the proposal the version came from, or null when it applied at once
  readonly approval: MemoryApproval | null;
}

// The owner's approval of a memory proposal, as an item's line reads it.
export interface MemoryApproval {
  // whether the quote that sent the proposal to review sat in a quoted block of the owner's
  // message, such as a forwarded email, which marks the proposal's text as outside content
  readonly isQuotePasted: boolean;
}

// What an item's line reads beside the item: the owner's name, or null for "the owner", and the
// zone and the time now that its date shows in.
export interface MemoryLineOptions extends MessageTimeOptions {
  readonly ownerName: string | null;
}

// One turn's retrieval: the text of the user's new messages, with the item limit and score floor.
interface MemoryRetrieval {
  readonly query: string;
  readonly limit: number;
  readonly minScore: number;

  // pinned items stay out, because the session's opening holds them
  readonly excludePinned: true;

  // the item versions the session already holds, which stay out so a newer version still matches
  readonly excludedVersions: readonly MemoryRef[];

  // the names that nearly every item holds, which stay out of the query so they match nothing
  readonly excludedWords: readonly string[];

  // the thread the recall record belongs to
  readonly thread: string;
}

// The memory the conversation reads each turn: the pinned core, and retrieval through recall. The
// memory store meets it, and the conversation declares it so models never imports memory.
export interface ConversationMemory {
  readonly readPinnedCore: () => Promise<readonly MemoryItem[]>;
  readonly recall: (request: MemoryRetrieval) => Promise<{ readonly items: readonly MemoryItem[] }>;

  // the short ID of each item that exists, by item ID, for an item that left the pinned core
  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

// How memory reaches the conversation, each setting tunable from the deployment configuration.
export interface ConversationMemorySettings {
  // the most memory items one turn's retrieval places
  readonly retrievalItems: number;

  // the lowest keyword score a retrieved item keeps
  readonly retrievalMinScore: number;

  // the budget, in tokens, of the recent turns a rebuilt session starts with
  readonly rebuildTokens: number;

  // the owner's name, which each memory item's line and the note-taker line read, or null for
  // "the owner"
  readonly ownerName: string | null;

  // the names the owner calls the agent by, which retrieval leaves out of the query with the
  // owner's name
  readonly agentNames: readonly string[];
}

// When nixie compacts the conversation's session, each setting tunable from the deployment
// configuration.
export interface CompactionSettings {
  // the share of the profile's window at or past which a turn's end compacts the session
  readonly threshold: number;

  // the token cap of the summary the model writes, which its word target derives from
  readonly summaryTokens: number;
}

// How your message's send time renders: the zone for a message that carries none, and the time
// now, which decides whether the year shows.
export interface MessageTimeOptions {
  readonly defaultZone: string;
  readonly now: Date;
}

// What a session cleanup runs for, which its records keep: a forgotten memory item, or the sequence
// of one forgotten record, such as your message.
export type SessionCleanupCause = { readonly itemID: string } | { readonly recordSequence: number };

// The conversation's runner as one step sees it: its sandbox, its endpoint and its profile.
export interface ConversationRun {
  readonly context: TasksContext;
  readonly profile: ResolvedProfile;

  // the profile as every guest frame carries it, with no credential reference and no prices
  readonly turnProfile: TurnProfile;
  readonly sandbox: Sandbox;

  // the conversation's run endpoint, which issues each turn a step token of its own
  readonly endpoint: Pick<RunEndpoint, 'startStep'>;
  readonly model: ToolRunModel;
  readonly command: GuestCommand;

  // the persona in force, read at each turn so a new seed reaches the next turn
  readonly getSystemPrompt: () => string;

  // the note of what happened outside the conversation since its last turn, such as memory changes
  // and events, which goes before the turn's first message, and the sequence it covers; given a
  // span, the note a new session's recent turns carry again over that span
  readonly readTurnNote?: (span?: TurnNoteRange) => Promise<TurnNote>;

  // the lines of a new session's status, each read when the session opens
  readonly status: StatusRegistry;

  // the memory store, read at each turn, which starts after the runner
  readonly memory: () => ConversationMemory;
  readonly memorySettings: ConversationMemorySettings;
  readonly compaction: CompactionSettings;

  // the IANA zone your message renders its send time in when it carries no zone of its own
  readonly defaultZone: string;

  // keeps a forget's session cleanup from meeting a running turn
  readonly session: SessionGuard;
}

// One step of the conversation as its parts see it: the run, the step's input, the session marks it
// read, and the signal that stops it when the lease is lost or a forget invalidates the session.
export interface SessionStep {
  readonly run: ConversationRun;
  readonly input: StepInput;
  readonly signal: AbortSignal;
  readonly marks: SessionMarks;
}

// What a step that takes the inbox may do: compact when its turn overflows or ends past the
// threshold, which a step whose compaction already failed never does again, and the records it
// commits before the turn's own.
export interface InboxPlan {
  readonly canCompact: boolean;
  readonly before: readonly RecordInput[];
}

// A note for the start of a turn and the last sequence it covers, which the turn's end record
// keeps, so the next turn's note starts after it.
export interface TurnNote {
  readonly text: string | null;
  readonly throughSequence: number;

  // how many events the note's range held, those past the events block's cap included
  readonly eventCount: number;
}

// How a new session starts: the first session, the one after a compaction, or a rebuild in place of
// a lost or invalidated one.
export type SessionStart =
  | { readonly kind: 'first' }
  | { readonly kind: 'compaction' }
  | {
      readonly kind: 'rebuild';
      readonly reason: 'lost' | 'forget';
      readonly lostSessionID: string | null;
    };

// The records a turn's note covers: those after the sequence the last turn's note covered, through
// the log's head when the note was read.
export interface TurnNoteRange {
  readonly after: number;
  readonly through: number;
}

// One thing that happened outside the conversation, as its event kind read it from the log.
export interface NotedEvent<Detail> {
  // the sequence of the record it came from, which orders events of every kind, oldest first
  readonly sequence: number;

  // when it happened, in epoch milliseconds
  readonly at: number;
  readonly detail: Detail;
}

// What an event's line reads beside its detail.
export interface EventSettings {
  // the owner's name, or null for "The owner"
  readonly ownerName: string | null;

  // the IANA time zone each event's time shows in, such as Europe/London
  readonly timeZone: string;
}

// One kind of event the events block lists: its name, how it reads its events in a range of the
// log, and how one event's line renders after its time.
export interface EventKind<Detail> {
  readonly name: string;
  readonly read: (range: TurnNoteRange) => Promise<readonly NotedEvent<Detail>[]>;

  // fills in what only a listed event shows, such as text whose delivery a recall records, for
  // this kind's events that the block lists after its cap
  readonly complete?: (
    events: readonly NotedEvent<Detail>[],
  ) => Promise<readonly NotedEvent<Detail>[]>;
  readonly render: (detail: Detail, settings: EventSettings) => string;
}

// An event as the registry read it, before the block picks the events it lists.
export interface ReadEvent {
  // the name of the kind that read it
  readonly kind: string;
  readonly sequence: number;
  readonly at: number;
}

// A listed event with its kind's renderer bound to it, so events of every kind render together.
export interface BoundEvent {
  readonly sequence: number;
  readonly at: number;
  readonly render: (settings: EventSettings) => string;
}

// The event kinds the events block reads, each with its detail type bound inside it. Complete takes
// only the kind's own events, and returns them bound, in the order given.
export type EventRegistry = readonly {
  readonly name: string;
  readonly read: (range: TurnNoteRange) => Promise<readonly ReadEvent[]>;
  readonly complete: (events: readonly ReadEvent[]) => Promise<readonly BoundEvent[]>;
}[];

// A checker's verdict on one question. Only asserted lets the gate that asked go ahead.
export type CheckerVerdict = 'asserted' | 'not_asserted' | 'unsure';

// One question for the checker: its system prompt, and the input the gate built for it.
export interface CheckerRequest {
  readonly prompt: string;
  readonly input: string;
}

// The checker's answer, with the model that gave it. A timeout, an error or an unreadable answer
// reads as unsure, with failure saying which.
export interface CheckerAnswer {
  readonly verdict: CheckerVerdict;
  readonly reason: string;
  readonly model: string;
  readonly failure: 'timeout' | 'error' | 'unreadable' | null;
}

// Asks the checker one question. It never rejects: a failure answers unsure.
export type RunCheck = (request: CheckerRequest) => Promise<CheckerAnswer>;
