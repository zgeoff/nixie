// Web: every agreed shape. Not compiled. No package imports this file.
// Where a doc and this file differ, this file wins for shapes and the doc wins for rules.
// Usage: 01-usage.ts. Flows: 03-flow.ts. Open items: ../../open/web.md.
//
// Not agreed, and so not binding: (open: unwritten shapes)
// - The signatures of makeFetchBackoff, readCachedPage, collectOwnValues, buildOwnerTypedCheck and
//   makeTypedExemption are this sketch's reading. Only their names and what they decide are agreed.
// - RewriteRule and the helper names inside 03-flow.ts are this sketch's own.

// ---- A. The rewrite rules ----

// The connectors module owns the rules. null when no rule matches, or when the text is no URL.
declare function rewriteFetchURL(url: string): { url: string; rule: string } | null;

// A rule is data in the code: a name, its exact hosts, and a pure function of a parsed URL.
interface RewriteRule {
  name: string;
  hosts: readonly string[];
  rewrite: (url: URL) => string | null;
}

// The 5 rules. <name> is pkg or @scope/pkg. <title> is one path segment.
//
// github-blob
//   matches  github.com/<owner>/<repo>/blob/<rest>
//   fetches  https://raw.githubusercontent.com/<owner>/<repo>/<rest>
//
// github-tree        (open: branch slash)
//   matches  github.com/<owner>/<repo>/tree/<ref>/<path>, with <ref> the first segment
//   fetches  https://api.github.com/repos/<owner>/<repo>/contents/<path>?ref=<ref>
//
// npm-package
//   matches  www.npmjs.com/package/<name>, with an optional /v/<version>
//   fetches  https://registry.npmjs.org/<name>/<version>
//            the version is `latest` when the URL holds none
//            a scoped name writes its slash as %2F
//
// pypi-project
//   matches  pypi.org/project/<name>/, with an optional <version>/
//   fetches  https://pypi.org/pypi/<name>/json, or https://pypi.org/pypi/<name>/<version>/json
//
// wikipedia-article  (open: wikipedia path)
//   matches  <lang>.wikipedia.org/wiki/<title> and <lang>.m.wikipedia.org/wiki/<title>
//   fetches  https://<lang>.wikipedia.org/w/rest.php/v1/page/<title>/html
//            a slash in <title> is written as %2F
//
// The one query string a rule accepts: ?plain=1 on a GitHub blob.

// ---- B. The Accept header ----

// The fetcher sends this header on every request.
const acceptHeader =
  'text/markdown, text/html;q=0.9, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.7';

// ---- C. The fetch reply on the wire ----

// FetchReply of the wire lib. Only the fields this design adds are shown in full.
type FetchReply =
  | {
      kind: 'page';
      // url, status, contentType, text, links, isTruncated, blocked: as built
      retryAfterMs: number | null; // the decoder reads a missing field as null
      isGated: boolean; // the decoder reads a missing field as false
    }
  | {
      kind: 'image';
      // url, status, contentType, base64: as built
      retryAfterMs: number | null;
      isGated: boolean;
    }
  | { kind: 'refused'; reason: string; isGated: boolean }
  | { kind: 'failed'; reason: string; isGated: boolean };

// retryAfterMs, set by the fetcher where it reads a response:
// - from Retry-After, as seconds or as a date, on a 429, a 503 or a 403;
// - from x-ratelimit-reset when x-ratelimit-remaining is 0, on any status. That header is a time
//   in seconds since 1970.
// A date and a reset time are times: the fetcher subtracts its own clock and sends the difference,
// never less than 0. A value the fetcher cannot parse gives null.
//
// isGated is true when the fetcher asked before each hop.

// ---- D. The fetch request on the wire ----

interface FetchRequest {
  url: string;
  limits: FetchLimits; // as built
  deniedRanges: readonly string[];

  // 'ask': the fetcher sends a hop frame and waits for a pass before each hop after hop 0
  hops: 'ask' | 'none';
}

// On the wire:
// - hops 'none' is the frame the code sends as built, byte for byte.
// - hops 'ask' writes "limits": { ..., "redirects": 0 } and one more field,
//   "hopGate": { "redirects": <the redirect limit> }.
// The decoder reads hopGate.redirects in place of limits.redirects when hopGate is there.
// Only the encoder and the decoder know the pair.

// ---- E. The hop frames ----

// Guest to server, before the fetcher resolves the hop's host or opens a connection.
interface FetchHop {
  kind: 'hop';
  url: string;
}

// Server to guest. The wire holds no refusal frame.
interface FetchHopPass {
  kind: 'hop-pass';
}

type FetchGuestFrame = FetchHop | FetchReply;

type AskHop = (url: string, signal: AbortSignal) => Promise<void>;

// The guest's half, in the wire lib: writes the hop frame, resolves on the pass, rejects on an
// abort or a closed input. It knows nothing of the fetcher.
declare function makeHopAsker(io: {
  frames: AsyncIterator<Uint8Array>;
  write: (bytes: Uint8Array) => Promise<void>;
}): AskHop;

// ---- F. The server's half of the hop gate ----

// The connectors module owns these types.
type SecretFinder = (url: string) => { readonly rule: string } | null;

interface PageHop {
  number: number; // 1 for the first redirect; the sent URL is hop 0
  url: string;
  sentBy: string; // the host of the URL before this one
}

type HopVerdict = { kind: 'pass' } | { kind: 'refuse'; reason: string };

type HopScan = (hop: PageHop) => Promise<HopVerdict>;

// Asked only after a match, with the rule that matched. true lets the matched URL through, and
// nixie logs nothing.
type IsExempt = (hop: number, rule: string) => Promise<boolean>;

// The one policy for every reader's hops. It writes the hop's refusal sentence (section L).
declare function makeHopScan(options: {
  findSecret: SecretFinder;
  isExempt: IsExempt;
  logger: Logger;
  event: string; // web_fetch.secret_refused | skill_fetch.secret_refused
}): HopScan;

// Reads frames from an ExecStream. It knows nothing of the fetcher. States: 03-flow.ts, section G.
declare function gatePageHops(
  stream: ExecStream,
  gate: { sentURL: string; redirects: number; scanHop: HopScan; limit: TimeLimit },
): Promise<FetchReply>;

// readPage of the fetch sandbox starter. A call with no scanHop sends hops 'none'.
declare function readPage(
  url: string,
  options?: { readonly scanHop?: HopScan },
): Promise<FetchReply>;

// ReadPage of the skills module takes one argument: (url: string) => Promise<FetchReply>.

// Checks a sent URL before its fetch, writes the refusal sentence and logs the event.
// null when the URL holds no secret, or when isExempt(0, rule) answers true.
declare function refuseFetchURL(
  url: string,
  options: { findSecret: SecretFinder; isExempt: IsExempt; logger: Logger; event: string },
): Promise<Extract<FetchReply, { kind: 'refused' }> | null>;

// Builds the one exemption of a call. Answer order: 03-flow.ts, section E.
// (open: unwritten shapes)
declare function makeTypedExemption(options: {
  run: ToolRun;
  namedURL: string;
  isOwnerTyped: (run: ToolRun, url: string) => Promise<boolean>;
  typedURLCovers: 'named_url' | 'redirects';
}): IsExempt;

// ---- G. The secret scan lib ----

// @heynixie/secret-scan, tagged server-only.

// The public rules alone.
declare function findSecret(url: string): { rule: string } | null;

// Each exact value first, then the public rules. An exact value reports the rule nixie-secret.
declare function makeSecretFinder(
  ownValues: readonly string[],
): (url: string) => { rule: string } | null;

const ownValueRule = 'nixie-secret';

// The public rules: the Betterleaks rules of github.com/betterleaks/betterleaks at v1.9.0,
// commit 81aff7a, MIT licence. (open: betterleaks pin)
// The rules that backtrack run on re2js, an entry of the root catalog.

// ---- H. The config keys ----

// All in the web_fetch section, a strict object.

interface WebFetchPauseKeys {
  backoff_ms: number; // whole, 0 or more; default 30000; the pause when the reply names none
  backoff_cap_ms: number; // whole, 0 or more; default 300000; the longest pause
  backoff_wait_ms: number; // whole, 0 or more; default 5000; the longest pause a call waits out
}

// (open: page cache)
interface WebFetchCacheKeys {
  cache_ms: number; // whole, 0 or more; default 300000; 0 turns the lookup off
}

interface WebFetchSecretKeys {
  // default 'redirects' (open: typed url redirects)
  secret_typed_url_covers: 'named_url' | 'redirects';

  // entry names of the secrets file; default: the 5 credential entries; an empty list matches the
  // public rules alone (open: own value entries)
  secret_own_values: readonly SecretsEntryName[];

  // whole, 1 or more; default 8 (open: own value length)
  secret_own_value_min_chars: number;

  // default true (open: skill file scan)
  secret_scan_skill_files: boolean;
}

// The 5 credential entries, and the default of secret_own_values. `settings` is the sixth entry of
// the secrets file and is outside the default.
type SecretsEntryName =
  | 'deployment_key'
  | 'impd_token'
  | 'definitions_export_token'
  | 'model_credentials'
  | 'connector_credentials'
  | 'settings';

// ---- I. What apps/server wires ----

// WebFetchOptions of startWebFetch holds 3 named options beside the built ones. The pause, cache
// and secret keys arrive in its `config` option.
interface WebFetchSecretOptions {
  findSecret: SecretFinder; // makeSecretFinder(collectOwnValues(secrets, config))
  isOwnerTyped: (run: ToolRun, url: string) => Promise<boolean>;
  logger: Logger;
}

// The web fetch tool takes the same 3, and a fourth that carries secret_typed_url_covers.
interface WebFetchToolSecretOptions extends WebFetchSecretOptions {
  typedURLCovers: 'named_url' | 'redirects';
}

// apps/server. Reads the entries that secret_own_values names, and omits a value shorter than
// secret_own_value_min_chars. (open: unwritten shapes)
declare function collectOwnValues(secrets: Secrets, config: WebFetchConfig): readonly string[];

// The memory module. true when the URL sits in a typed span of one of the thread's newest 50
// readable messages. (open: typed text) (open: unwritten shapes)
declare function buildOwnerTypedCheck(log: Log): (run: ToolRun, url: string) => Promise<boolean>;
const typedMessageLimit = 50;

// ---- J. The pause per host ----

// The connectors module. The state is a map from a host to the time its pause ends, in the server
// process. (open: unwritten shapes)
declare function makeFetchBackoff(options: {
  backoffMs: number;
  backoffCapMs: number;
  clock: Clock;
}): FetchBackoff;

interface FetchBackoff {
  // the milliseconds left of the host's pause, 0 when the host has none
  readPause: (host: string) => number;

  // sets a pause from a reply, as 03-flow.ts, section C, decides
  setPause: (host: string, retryAfterMs: number | null) => void;

  // (open: forget clears pauses)
  clear: () => void;
}

// ---- K. The page cache ----

// (open: page cache) Every shape of this section is built only when the cache is.

// web_fetch input: one more member, allowed with `url` or `link`.
interface WebFetchCacheInput {
  fresh?: boolean; // true skips the stored copy
}

// web_fetch result: one more member, required, with an endorsed type.
interface WebFetchCacheResult {
  isCached: boolean; // true when a `url` or `link` call returned a stored copy
}

// web_fetch_pages: one more column.
interface WebFetchPageRowCache {
  fetch_url: string | null; // the sent URL of the pass that stored the row
}

// The lookup. null on a miss. (open: unwritten shapes)
declare function readCachedPage(
  log: Pick<Log, 'writer'>,
  query: { sessionKey: string; sentURL: string; cacheMs: number; now: number },
): Promise<StoredPage | null>;

// ---- L. The exact texts ----

// Each sentence a model reads is here and nowhere else.

// The pause error, a tool error. {seconds} is a whole number. (open: unwritten shapes)
// Example: registry.npmjs.org asked for a pause, so fetch it again in 42 seconds
const pauseError = '{host} asked for a pause, so fetch it again in {seconds} seconds';

// The refusal of a sent URL, a tool error. Example rule: github-pat.
const secretRefusal = 'the URL holds a secret (rule {rule}), so it was not fetched';

// The refusal of a hop, a tool error. {host} is the host that sent the redirect.
const hopRefusal =
  '{host} redirected to a URL that holds a secret (rule {rule}), so it was not fetched';

// The hop refusal when the sending host's own name matches the finder: it names no host.
// (open: hostless hop sentence)

// The reason of a failed reply with isGated false to a gated request: it says that the fetch image
// is of a release before the server's. (open: image release reason)

// The tool error for `fresh` with `page`. (open: fresh with page text)

// The sentence of the web fetch tool's description: a page of a known site comes back in its raw
// or JSON form, and `url` shows what nixie fetched. (open: description sentence)

// Log events, which the server writes. Each holds the rule and the hop's number, and nothing else.
const webFetchRefusedEvent = 'web_fetch.secret_refused';
const skillFetchRefusedEvent = 'skill_fetch.secret_refused';

interface SecretRefusedFields {
  rule: string;
  hop: number;
}

// ---- M. The tool outcome ----

// The tools module.
type ToolOutcome =
  | ({ status: 'ok' } & DirectResult)
  | { status: 'error'; message: string; hidden?: JSONObject };

interface TypedResult {
  result: JSONObject;
  record?: JSONObject; // the form the result record stores in place of the result
}

interface DirectResult extends TypedResult {
  images?: readonly ToolImage[];

  // what the server records and the model never reads, in the result or through log.read
  hidden?: JSONObject;
}

// ActionOutcome, the outcome of a queued tool, holds no `hidden`.

// The erasable fields of a tool_result record:
//   ok                          { result: record ?? result, hidden? }
//   an error the tool returns   { message, hidden? }
//   every other outcome         { message }
// `hidden` is stored only when the tool set it to an object with 1 key or more.

// The search tool's hidden object.
interface SearchHidden {
  costUSD: number;
}

// ---- N. Short IDs in a tool record ----

// The UUIDs of a record, keyed by the short ID the record shows.
interface HiddenUUIDs {
  uuids: Record<string, string>; // { <shortID>: <uuid> }
}

// The keys that hold a short ID in each tool's record:
//   moment.find     momentID of each entry of `moments`
//   moment.read     momentID
//   moment.keep     momentID
//   moment.edit     momentID
//   moment.retire   momentID
//   moment.link     momentID, itemID
//   memory.recall   itemID of each item
//   memory.pending  proposalID of each entry of `proposals`   (open: proposal short id)

// The keys whose UUID-shaped value log.read swaps, at any depth of `result`.
// (open: stored uuid rule) (open: change rows)
const swappedKeys = ['momentID', 'itemID', 'changeID'] as const;
