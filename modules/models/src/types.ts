import type { Sandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { RunEndpoint, ToolRunModel } from '@heynixie/tools';
import type { SessionGuard } from './make-session-guard';
import type { GuestCommand } from './run-guest-turn';

// The model roles, each of which names the profile it uses.
export type ModelRole = 'conversation' | 'task' | 'worker' | 'checker' | 'memory-writer';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Prices per million tokens, in the deployment's currency.
export interface ModelPrices {
  readonly input: number;
  readonly cacheWrite: number;
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

  // parsed for the counting proxy, which prices each response; nothing here reads them
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
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: string;

  // when the version was recorded, in milliseconds since the epoch
  readonly recordedAt: number;

  // the quote the text was saved from, which a retirement carries over, or null for none
  readonly evidenceQuote: string | null;
}

// One turn's retrieval: the text of the user's new messages, with the item limit and score floor.
interface MemoryRetrieval {
  readonly query: string;
  readonly limit: number;
  readonly minScore: number;

  // pinned items stay out, because the system prompt holds them
  readonly excludePinned: true;

  // the thread the recall record belongs to
  readonly thread: string;
}

// The memory the conversation reads each turn: the pinned core, and retrieval through recall. The
// memory store meets it, and the conversation declares it so models never imports memory.
export interface ConversationMemory {
  readonly readPinnedCore: () => Promise<readonly MemoryItem[]>;
  readonly recall: (request: MemoryRetrieval) => Promise<{ readonly items: readonly MemoryItem[] }>;
}

// How memory reaches the conversation, each setting tunable from the deployment configuration.
export interface ConversationMemorySettings {
  // the most memory items one turn's retrieval places
  readonly retrievalItems: number;

  // the lowest keyword score a retrieved item keeps
  readonly retrievalMinScore: number;

  // the budget, in tokens, of the recent turns a rebuilt session starts with
  readonly rebuildTokens: number;

  // the owner's name, which says who saved an item the owner saved, or null for "the owner"
  readonly ownerName: string | null;
}

// The conversation's runner as one step sees it: its sandbox, its endpoint and its profile.
export interface ConversationRun {
  readonly context: TasksContext;
  readonly profile: ResolvedProfile;
  readonly sandbox: Sandbox;
  readonly endpoint: Pick<RunEndpoint, 'token'>;
  readonly model: ToolRunModel;
  readonly command: GuestCommand;

  // the persona in force, read at each turn so a new seed reaches the next turn
  readonly getSystemPrompt: () => string;

  // the note of what happened outside the conversation since its last turn, such as memory changes
  // and events, which goes before the turn's first message, and the sequence it covers
  readonly readTurnNote?: () => Promise<TurnNote>;

  // the memory store, read at each turn, which starts after the runner
  readonly memory: () => ConversationMemory;
  readonly memorySettings: ConversationMemorySettings;

  // keeps a forget's session cleanup from meeting a running turn
  readonly session: SessionGuard;
}

// A note for the start of a turn and the last sequence it covers, which the turn's end record
// keeps, so the next turn's note starts after it.
export interface TurnNote {
  readonly text: string | null;
  readonly throughSequence: number;
}

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
  readonly render: (detail: Detail, settings: EventSettings) => string;
}

// An event with its kind's renderer bound to it, so events of every kind sort and render together.
export interface BoundEvent {
  readonly sequence: number;
  readonly at: number;
  readonly render: (settings: EventSettings) => string;
}

// The event kinds the events block reads, each with its detail type bound inside it.
export type EventRegistry = readonly {
  readonly name: string;
  readonly read: (range: TurnNoteRange) => Promise<readonly BoundEvent[]>;
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
