// Harnesses: every agreed shape. Not compiled. No package imports this file.
// Where a doc and this file differ, this file wins for shapes and the doc wins for rules.
// Usage: 01-usage.ts. Flows: 03-flow.ts. Open items: ../../open/harnesses.md.
//
// Not agreed, and so not binding:
// - The signatures of defineHarness and HarnessProfileSchema. (open: defineHarness signature)
// - The inputs and outputs of the 3 turnInputs procedures. (open: turnInputs procedures)
// - The byte layout inside the `~in.` tag. (open: capture tag layout)
// - The text of each guest-neutral host error. (open: host error texts)
// - The helper names inside 03-flow.ts are this sketch's own.

// ---- A. Harness IDs and capabilities (libs/wire, built) ----

export const harnessIDs = ['agent-sdk', 'codex'] as const;

export type HarnessID = (typeof harnessIDs)[number];

export type HarnessCapability =
  | 'tools'
  | 'fresh-session'
  | 'resume'
  | 'resume-at-entry'
  | 'live-messages'
  | 'interrupt'
  | 'summarize'
  | 'structured-output'
  | 'images'
  | 'turn-limit'
  | 'call-usage'
  | 'context-window';

// harnessCapabilities["agent-sdk"]: all 12.
// harnessCapabilities["codex"]: tools, fresh-session, interrupt, images, turn-limit, call-usage.

// ---- B. The turn outcome and the `ended` frame (libs/wire) ----

export const turnOutcomeSchema = z.enum([
  'finished',
  'stopped',
  'limit',
  'interrupted',
  'overflow',
]);

export type TurnOutcome = z.infer<typeof turnOutcomeSchema>;

// The frame holds no `subtype` key.
const endedFrameSchema = z.object({
  type: z.literal('ended'),

  // required: the one field the host reads to tell how the turn ended
  outcome: turnOutcomeSchema,

  // sent exactly when the harness declares `resume`
  boundary: sessionPointSchema.optional(),

  // the harness's own words, which the host records and never reads
  stopReason: z.string().nullable().optional(),
  terminalReason: z.string().optional(),

  isError: z.boolean().optional(),
  turns: z.int().nonnegative(),
  usage: usageSchema,
  thinkingTokens: tokenCountSchema.optional(),

  // only from a harness that declares `context-window`
  context: contextSchema.optional(),
});

// assistant.messageID: z.string().min(1)

// The session point union holds one member, the Agent SDK's: { harness, sessionID, messageID }.
// A point with no `harness` key parses as an `agent-sdk` point.

// ---- C. The turn profile union and the turn frame's fields (libs/wire) ----

const agentSDKTurnProfileSchema = z.object({
  harness: z.literal('agent-sdk'),
  model: z.string().min(1),
  baseURL: z.url(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  authHeader: z.enum(['bearer', 'x-api-key']),
  contextTokens: z.int().positive().nullable(),
  cacheTTL: z.enum(['5m', '1h']),

  // null on every Claude profile. Section K.
  requestRewrite: z.object({ providerPin: z.string().nullable() }).nullable().default(null),
});

const codexTurnProfileSchema = z.object({
  harness: z.literal('codex'),
  model: z.string().min(1),
  baseURL: z.url(),

  // The values of the protocol types that the pinned Codex CLI generates. (open: codex effort values)
  effort: codexEffortSchema,
});

const turnProfileSchema = z.discriminatedUnion('harness', [
  agentSDKTurnProfileSchema,
  codexTurnProfileSchema,
]);

// The check request's `profile` is the same union.

const turnLimitsSchema = z.object({
  // null for a harness without `turn-limit`, and for a turn with no limit
  modelCalls: z.int().positive().nullable(),

  // milliseconds; copied from the harness record's `toolCallWaitMs`
  toolCallWaitMs: z.int().positive().nullable(),
});

// turn.resume: sessionPointSchema.nullable().optional(). The key is absent for a harness without
// `resume`.

// ---- D. What each host frame needs, and the host's encoder (libs/wire) ----

export const hostFrameNeeds: Record<HostFrame['type'], HarnessCapability | null> = {
  turn: null,
  message: 'live-messages',
  interrupt: 'interrupt',
  summarize: 'summarize',
  purge: null,
};

export const turnFieldNeeds = { resume: 'resume', modelCalls: 'turn-limit' } as const;

// Throws on a frame that the capabilities do not cover, and on a turn frame that holds a `resume`
// key or a non-null `modelCalls` that they do not cover. It sends nothing then.
export declare function encodeHostFrame(
  capabilities: ReadonlySet<HarnessCapability>,
  frame: HostFrame,
): Uint8Array;

// encodeTurnFrame takes guest frames only.

// ---- E. The profile every reader takes, and the harness record (modules/models) ----

export interface ModelProfile {
  readonly id: string;
  readonly harness: HarnessID;
  readonly baseURL: string;
  readonly credential: string;
  readonly model: string;
  readonly prices: ModelPrices | null;
}

// One harness, bound to one profile. Host code holds this and never a harness's own profile type.
export interface Harness {
  readonly id: HarnessID;
  readonly api: ModelAPI; // 'anthropic-messages' | 'openai-responses'
  readonly capabilities: ReadonlySet<HarnessCapability>;
  readonly guest: HarnessGuest; // { package, entries: { turn, check: string | null } }, built

  // SandboxImageKey and SandboxSizeRow: the sandbox module's types. sandbox-images.md and
  // sandbox-sizes.md own them.
  readonly imageKey: SandboxImageKey;
  readonly sizeRows: {
    readonly conversation: SandboxSizeRow | null; // null: the harness serves no conversation
    readonly systemTask: SandboxSizeRow;
  };

  // milliseconds; null: the runtime has no such setting, or its probe has not passed
  readonly toolCallWaitMs: number | null;

  // the MCP _meta key under which the guest sends the model's tool-use ID on each tool call
  readonly toolUseMetaKey: string | null;

  readonly secretHeader: SecretSpec['header']; // 'bearer' | 'x-api-key'
  readonly buildGrant: (secret: SecretSpec) => GrantSpec;

  // 'one-off': a session nixie never resumes, such as a check. The Agent SDK definition gives it
  // the 5-minute cache lifetime.
  readonly toTurnProfile: (use: 'kept' | 'one-off') => TurnProfile;

  // tokens; null for a harness without `context-window`. The skill catalog's loader takes it as a
  // number.
  readonly contextWindow: number | null;

  // non-null exactly when the harness declares `resume` and `resume-at-entry`
  readonly session: HarnessSession | null;
}

export interface HarnessSession {
  readonly owns: (point: SessionPoint) => boolean;
  readonly nameSession: (point: SessionPoint) => string;

  // the paths, relative to the folder that holds a session, that a replaced sandbox carries
  readonly listFiles: (point: SessionPoint) => readonly string[];
}

// ---- F. One definition per harness, and the list (modules/models) ----

// (open: defineHarness signature) Only these names and what each decides are agreed.
interface HarnessDefinition<ID extends HarnessID, Profile extends ModelProfile> {
  readonly id: ID;

  // strict: it refuses a key that the harness's loop ignores
  readonly profileSchema: HarnessProfileSchema<Omit<Profile, 'id'>>;

  readonly bind: (profile: Profile) => Harness;
}

// Checks, when the module loads, that `session` is non-null exactly when the capabilities hold
// `resume` and `resume-at-entry`.
declare function defineHarness<ID extends HarnessID, Profile extends ModelProfile>(
  definition: HarnessDefinition<ID, Profile>,
): HarnessDefinition<ID, Profile>;

export const harnesses = [agentSDKHarness, codexHarness] as const;
export declare function bindHarness(profile: ModelProfile): Harness;

// The digest's parts are the profile ID, the header and the host, in that order.
export declare function deriveModelSecret(resolved: ResolvedProfile, harness: Harness): SecretSpec;

// Builds the profile union from the list. Its message for an unknown harness names the list's IDs.
export declare function buildModelsConfigSchema(list: typeof harnesses): ModelsConfigSchema;

// ---- G. The 2 definitions ----

interface AgentSDKProfile extends ModelProfile {
  readonly authHeader: 'bearer' | 'x-api-key';
  readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  readonly contextTokens: number | null;
  readonly cacheTTL: '5m' | '1h';
  readonly providerPin: string | null;
  readonly outsideClaude: boolean | null; // section K
}

interface CodexProfile extends ModelProfile {
  readonly effort: CodexEffort;
}

// What each definition's `bind` returns.
const agentSDKValues = {
  id: 'agent-sdk',
  api: 'anthropic-messages',
  capabilities: 'all 12',
  guest: { package: 'conversation', entries: { turn: 'main', check: 'check' } },
  imageKey: 'conversation',
  sizeRows: { conversation: 'conversation', systemTask: 'systemTask' },
  toolCallWaitMs: 900_000, // null until its probe passes. (open: agent-sdk tool-call timeout)
  toolUseMetaKey: 'claudecode/toolUseId',
  secretHeader: "the profile's authHeader",
  buildGrant: 'the placeholder in ANTHROPIC_AUTH_TOKEN for bearer, else in ANTHROPIC_API_KEY',
  toTurnProfile:
    "section C, first member; cacheTTL '5m' for 'one-off'; requestRewrite by section K",
  contextWindow: "the profile's contextTokens, or else getCLIContextWindow(model)",
  session: {
    owns: "point.harness === 'agent-sdk'",
    nameSession: 'point.sessionID',
    listFiles: ['<sessionID>.jsonl', '<sessionID>/'],
  },
};

const codexValues = {
  id: 'codex',
  api: 'openai-responses',
  capabilities: 'the 6 of section A',
  guest: { package: 'codex', entries: { turn: 'main', check: null } },
  imageKey: 'codex',
  sizeRows: { conversation: null, systemTask: 'codexTask' },
  toolCallWaitMs: 900_000, // null until its probe passes. (open: codex tool-call timeout)
  toolUseMetaKey: 'callId',
  secretHeader: "'bearer' or 'x-api-key'", // (open: codex secret header)
  buildGrant: 'a grant whose placeholder sits in OPENAI_API_KEY',
  toTurnProfile: "{ harness: 'codex', model, baseURL, effort }, the same for both uses",
  contextWindow: null,
  session: null,
};

// ---- H. The session state `unkept`, and the outcome on the turn record ----

// SessionState holds `unkept` beside fresh, summarized, lost, invalidated, resumable and
// compaction-due. nixie derives it at each step and stores it nowhere.
//
// model.turn_ended: `outcome: TurnOutcome`, optional. `stopReason` and `terminalReason` are text.
// A Codex turn writes `stopReason: null`.
//
// The opening record of a step from `unkept`:
const unkeptOpening = { kind: 'rebuild', reason: null, lostSessionID: null };

// ---- I. Host errors about a guest ----

// (open: host error texts) Each of the 3 host errors about a guest names the guest by its
// harness's guest package, or names no guest. Built, with "the conversation guest":
//   "the conversation guest did not remove its session state: <detail>"
//   "the conversation guest reported a purge during a turn"
//   "the conversation guest exited with code <code> and signal <signal> before it ended its turn: <stderr>"
// The throw of encodeHostFrame and the broken-contract failure of a step have no agreed text.

// ---- J. Config: a profile on `harness: codex` (strict) ----

interface CodexProfileInput {
  harness: 'codex';
  base_url: string;
  credential: string; // deployment:<name>
  model: string;
  effort: CodexEffort;
  prices: {
    input: number;
    cache_write: number;
    cache_write_1h: number;
    cached_input: number;
    output: number;
  };
}

// Refused keys: auth_header, cache_ttl, context_tokens, provider_pin, outside_claude.

// ---- K. Tasks on OpenRouter models: profile keys, wire field, guest functions ----

// Two keys of a profile on `harness: agent-sdk`, beside the built keys.
interface OutsideClaudeKeys {
  outside_claude?: boolean; // parses into outsideClaude; absent parses into null
  provider_pin?: string; // built; parses into providerPin
}

// requestRewrite on the agent-sdk turn profile (section C):
//   outsideClaude !== true  -> null
//   outsideClaude === true  -> { providerPin }
// The harness record sets it. (open: openrouter harness record)

// guests/conversation. None of the 3 files imports the Agent SDK.

// rewrite-model-request.ts: pure
type RewriteResult = { ok: true; body: string } | { ok: false; error: string };

declare function rewriteModelRequest(
  endpoint: 'messages' | 'count_tokens',
  body: string,
  rule: { systemPrompt: string; providerPin: string | null },
): RewriteResult;

// build-provider-order.ts: the one place that knows the body field an aggregator takes.
// (open: provider order field)
declare function buildProviderOrder(pin: string): Readonly<Record<string, unknown>>;

// start-request-rewriter.ts: null when the frame's profile holds no requestRewrite
interface RequestRewriter {
  url: string; // the loopback URL the CLI gets as ANTHROPIC_BASE_URL
  refused: Promise<Error>; // settles at the first refusal
  stop: () => Promise<void>;
}

declare function startRequestRewriter(
  frame: TurnFrame | SummarizeFrame,
  sendUpstream?: typeof fetch,
): RequestRewriter | null;

type RewriterState = 'none' | 'open' | 'refused' | 'closed';

// ---- L. Tasks on OpenRouter models: the exact texts ----

// Refusals at the config's load. `<model>` and `<id>` are the profile's model and ID.
const loadRefusals = {
  missingMark:
    'the model <model> names no Claude model, so the profile must state outside_claude: true or false',
  pinOnClaude:
    'a provider pin changes the request body, which nixie does only for a profile outside Claude',
  checkerOutsideClaude:
    'the checker role runs on the profile <id>, which is outside Claude, and a check removes no CLI block',
};

// Refusals of the rewriter. Each is the detail of a `failed` frame with the reason `error`, and the
// message of a 400 in the Messages error shape. `<n>` is the count of system blocks.
const rewriterRefusals = {
  notTextBlocks:
    "nixie refused a model request to <model>: its system prompt is not a list of text blocks, so nixie cannot show that the CLI's blocks are gone",
  noTail:
    "nixie refused a model request to <model>: no tail of its <n> system blocks equals nixie's system prompt, so nixie cannot show that the CLI's blocks are gone",
  otherRequest:
    'nixie refused a model request to <model>: it can show the removal only on messages and token counts, so it refuses <method> <path>',
};

// A listener that cannot bind: the bind error is the detail, before the CLI starts.

// The schema range for `context_tokens` of a model outside the CLI's catalogue, built only when
// the long-prompt probe passes: 100,000 to 1,000,000. (open: long prompt probe)

// ---- M. The turn-input log: config ----

// nixie's config. An absent section means the log is off.
interface TurnInputLogConfig {
  default: 'off' | 'always';
  max_window: Duration; // the longest time one `on` may last; 24h
  close_wait: Duration; // the longest a step's end waits for the proxy's `.part` files; 5s
  roles: ModelRole[]; // [conversation, task]
  retention: { days: 3 | 7 | 30; bytes: number }; // 7 and 2147483648
  on_forget: 'threads' | 'since_item' | 'keep'; // threads
  sources: Record<string, { base_url: string; dir: string }>; // one capture point each
}

// The counting proxy's config. An absent key means the proxy removes a tag and writes no file.
interface ProxyCaptureConfig {
  spool: string; // the spool folder; the same folder as the source's `dir`
  max_bytes: number; // 536870912
}

// Fixed figures, not config: the spool read every 1 second while a capture is open; the sweep at
// start, every 10 minutes and after each intake; 5 intake passes before `intake_failed`.

// ---- N. The turn-input log: the capture tag and the spool file (libs/wire) ----

// One path segment after the route ID: `/<route>/~in.<base64url>/…`. It holds the capture ID and
// the public key, and no secret. (open: capture tag layout)
interface CaptureTag {
  captureID: string; // a random UUID
  sealTo: Uint8Array; // the capture's P-256 public key
}

// File name: <spool>/<captureID>.<writer>.<counter>.part, then .cap; or .miss.
// Layout: a 4-byte header length, the header as JSON, then AES-256-GCM ciphertext. The key is
// derived from the request's ephemeral key and the tag's key. The additional data is
// (captureID, writer, counter). A committed fixture per `version` sits beside the type.
interface SpoolHeader {
  version: 1;
  captureID: string;
  writer: string; // random per start of the proxy
  counter: number; // rises by one per written request
  receivedAt: number;
  route: string;
  api: ModelAPI;
  endpoint: 'messages' | 'responses';
  upstreamStatus: number;
  bytes: number;
  sha256: string; // of the plain body; checked at intake and stored nowhere else
  ephemeralKey: string;
  iv: string;
}

type CaptureMissReason = 'spool_full' | 'spool_write_failed' | 'seal_failed'; // the proxy's 3

type InputMissReason =
  | CaptureMissReason
  | 'no_capture_point'
  | 'not_received'
  | 'store_unavailable'
  | 'capture_closed'
  | 'unknown_capture'
  | 'undecodable'
  | 'intake_failed'
  | 'holds_own_value';

// ---- O. The turn-input log: record kinds ----

// No payload and no erasable field holds any of a request's text. The thread and the step key sit
// in the envelope.
interface InputLogSet {
  state: 'on' | 'off';
  until: number | null;
}

interface InputCaptureOpened {
  captureID: string;
  taskID: string;
  stepRunID: string; // <stepKey>@<generation>
  role: ModelRole;
  profile: string;
  model: string;
  harness: HarnessID;
  api: ModelAPI;
  source: string; // a key of `sources`
  keyID: string;
  sealedPrivateKey: string;
}

interface InputCaptureClosed {
  captureID: string;
  logged: number;
  missed: number;
  cause: 'step_ended' | 'forget' | 'server_start';
}

interface InputLogged {
  inputID: string;
  captureID: string;
  spoolName: string;
  taskID: string;
  stepRunID: string;
  call: number; // the file's place in the proxy's (writer, counter) order within the capture
  role: ModelRole;
  profile: string;
  model: string;
  harness: HarnessID;
  api: ModelAPI;
  endpoint: 'messages' | 'responses';
  route: string;
  isRewritten: boolean; // true when the step's profile states outside_claude: true
  upstreamStatus: number;
  receivedAt: number;
  bytes: number;
  keyID: string;
}

interface InputMissed {
  captureID: string;
  stepRunID: string;
  reason: InputMissReason;
  count: number;
}

interface InputRemoved {
  inputID: string;
  cause: 'retention' | 'byte_bound' | 'forget' | 'missing';
}

interface InputOpened {
  inputID: string;
  by: 'host';
}

// The 7 kinds: model.input_log_set, model.input_capture_opened, model.input_capture_closed,
// model.input_logged, model.input_missed, model.input_removed, model.input_opened.

// ---- P. The turn-input log: the store ----

// <data directory>/turn-inputs/<inputID>.bin
//   a 12-byte IV, then the body's ciphertext, with the key ID and the input ID as additional data
// keys.db
//   one key per logged request, and one per open capture for its private key; every ID random
// nixie.db, table turn_inputs (a projection, one row per request)
//   the request's identity, bytes, state, removed_cause
// nixie.db, table turn_input_captures (a projection, one row per capture)
//   state, next_call

type SwitchState = 'off' | { on: { until: number | null } };

type CaptureState = 'open' | 'closed';

type RequestState = 'spooled' | 'logged' | 'missed' | 'removed'; // removed is final

// ---- Q. The turn-input log: the host procedures and the module's option ----

// libs/contract, in hostContract, on the control socket. (open: turnInputs procedures)
//   turnInputs.list   envelope fields and misses; not an opening
//   turnInputs.open   commits model.input_opened, then returns one request's body
//   turnInputs.set    turns the log on or off and commits model.input_log_set
// The device API's `contract` holds none of them.

// The server builds the search and passes it to modules/turn-inputs.
interface TurnInputsOptions {
  holdsOwnValue: (body: Uint8Array) => boolean;
}

// The values come from collectOwnValues, which the web fetch secret scan shares. Its shape, its 2
// config keys and their defaults: ../web/02-types.ts, sections H and I.
