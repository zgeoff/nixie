// Web: how a caller uses each shape. Not compiled. No package imports this file.
// Shapes: 02-types.ts. Flows: 03-flow.ts. Every ID, URL and value here is invented.

// ---- A. A fetch of a page that a rule rewrites ----

// The model names a GitHub file page.
const blobCall = { url: 'https://github.com/acme/widgets/blob/main/README.md' };

// nixie fetches the raw file. The result's `url` is the URL the fetch ended at.
const blobResult = {
  url: 'https://raw.githubusercontent.com/acme/widgets/main/README.md',
  status: 200,
  contentType: 'text/plain; charset=utf-8',
  page: 'p7k2m9x4qa',
  part: 1,
  parts: 1,
  text: '# widgets\n...',
  isTruncated: false,
  blocked: null,
  isCached: false, // (open: page cache)
};

// What the rule function gives for that URL, and for a URL that matches no rule.
rewriteFetchURL('https://github.com/acme/widgets/blob/main/README.md');
// { url: 'https://raw.githubusercontent.com/acme/widgets/main/README.md', rule: 'github-blob' }
rewriteFetchURL('https://example.com/docs?page=2'); // null

// ---- B. A stored copy, and `fresh` ----

// (open: page cache)
// The same call inside cache_ms returns the stored copy and starts no sandbox.
const cachedResult = { ...blobResult, isCached: true };

// `fresh: true` skips the stored copy. It is allowed with `url` or `link`.
const freshCall = { url: 'https://github.com/acme/widgets/blob/main/README.md', fresh: true };

// `fresh` with `page` is refused with a tool error. (open: fresh with page text)
const refusedCall = { page: 'p7k2m9x4qa', part: 2, fresh: true };

// ---- C. A paused host ----

// A call for a host whose pause is longer than backoff_wait_ms ends with the pause error.
const pausedOutcome = {
  status: 'error',
  message: 'registry.npmjs.org asked for a pause, so fetch it again in 42 seconds',
};

// ---- D. A URL that holds a secret ----

// The model names a URL with a token. nixie starts no sandbox.
const secretCall = { url: 'https://api.example.com/v1/items?token=<a GitHub token>' };

const secretOutcome = {
  status: 'error',
  message: 'the URL holds a secret (rule github-pat), so it was not fetched',
};

// A redirect to a URL that holds a secret.
const hopOutcome = {
  status: 'error',
  message:
    'example.com redirected to a URL that holds a secret (rule github-pat), so it was not fetched',
};

// The log event of each. It holds the rule and the hop's number.
logger('web_fetch.secret_refused', { rule: 'github-pat', hop: 0 });
logger('web_fetch.secret_refused', { rule: 'github-pat', hop: 1 });

// ---- E. The config ----

// The web_fetch section, with each key at its default.
const webFetchSection = {
  backoff_ms: 30000,
  backoff_cap_ms: 300000,
  backoff_wait_ms: 5000,
  cache_ms: 300000, // (open: page cache)
  secret_typed_url_covers: 'redirects',
  secret_own_values: [
    'deployment_key',
    'impd_token',
    'definitions_export_token',
    'model_credentials',
    'connector_credentials',
  ],
  secret_own_value_min_chars: 8,
  secret_scan_skill_files: true,
};

// ---- F. What apps/server wires ----

// tool-part-declarations builds the 3 values where it calls startWebFetch.
const webFetch = startWebFetch({
  adapter,
  image,
  deniedRanges,
  config, // carries the pause, cache and secret keys
  log,
  findSecret: makeSecretFinder(collectOwnValues(secrets, config)),
  isOwnerTyped: buildOwnerTypedCheck(log),
  logger,
});

// A test passes a recording finder through the same option.
const asked: string[] = [];

startWebFetch({
  ...options,
  findSecret: (url) => {
    asked.push(url);

    return null;
  },
});

// The skill file reader's wrapper: one argument for the skills module, the scan inside.
const readSkillPage: ReadPage = async (url) => {
  if (!config.secretScanSkillFiles) return skillSandbox.readPage(url);

  const neverExempt: IsExempt = () => Promise.resolve(false);
  const scan = { findSecret, isExempt: neverExempt, logger, event: 'skill_fetch.secret_refused' };

  const refused = await refuseFetchURL(url, scan);

  return refused ?? skillSandbox.readPage(url, { scanHop: makeHopScan(scan) });
};

// ---- G. A tool that keeps a value from the model ----

// The search tool, on hits. It returns no `record`.
const searchOutcome = { status: 'ok', result: { hits }, hidden: { costUSD: 0.012 } };

// The search tool, when a forget ended the session while the provider answered.
// `sessionEnded` is the message the built search tool returns for that case.
const refusedSearchOutcome = { status: 'error', message: sessionEnded, hidden: { costUSD: 0.012 } };

// What the tool runner stores as the erasable fields of each tool_result record.
const storedSearch = { result: { hits }, hidden: { costUSD: 0.012 } };
const storedRefusedSearch = { message: sessionEnded, hidden: { costUSD: 0.012 } };

// ---- H. A tool entry of log.read ----

// log.read prints the JSON text of `result` or `message`, under its own key, and nothing else.
const searchEntryText = '{"result":{"hits":[]}}';
const refusedSearchEntryText = JSON.stringify({ message: sessionEnded });

// A stored search record with the cost inside `result`, and `sources` that name `hits` alone.
const storedWithCostInResult = { result: { hits: [], costUSD: 0.012 } };
const thatEntryText = '{"result":{"hits":[]}}';

// ---- I. Short IDs in a tool record ----

// moment.edit. The result and the record both show the short ID.
const momentEditOutcome = {
  status: 'ok',
  result: { momentID: 'k3v9t2m7qa', version: 4 },
  record: { momentID: 'k3v9t2m7qa', version: 4 },
  hidden: { uuids: { k3v9t2m7qa: '5b1f0c1e-2a57-4a0b-9c37-0f6d3f6f2b11' } },
};

// memory.pending. The result and the record show a short ID as proposalID.
// (open: proposal short id)
const pendingOutcome = {
  status: 'ok',
  result: { proposals: [{ proposalID: 'w8n4c6r2hd' /* the other keys: as built */ }] },
  record: { proposals: [{ proposalID: 'w8n4c6r2hd' }] },
  hidden: { uuids: { w8n4c6r2hd: '0d6a3c52-91be-4f0e-8a7c-2f5d1b9e4c33' } },
};

// A stored moment.edit record with a UUID under momentID, as log.read prints it.
// (open: stored uuid rule)
const storedWithUUID = { result: { momentID: '5b1f0c1e-2a57-4a0b-9c37-0f6d3f6f2b11', version: 4 } };
const entryWhenTheRowExists = '{"result":{"momentID":"k3v9t2m7qa","version":4}}';
const entryWhenTheMomentIsDestroyed = '{"result":{"version":4}}';
