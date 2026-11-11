// Web: each flow as commented code. Not compiled. No package imports this file.
// Shapes: 02-types.ts. Where a doc and a sketch differ, the sketch wins for shapes and the doc
// wins for rules. The helper names here are this sketch's own.

// ---- A. The flow of one `url` or `link` call ----

// The tool runner writes the call record before step 1 and the result record after the last step.
// No step writes either. Each step is one call to a function in a file of its own.
async function runPageFetch(fetching, request, view) {
  // 1. Parse. Read the link's target for a `link` call. This is the named URL.
  const namedURL = await readNamedURL(fetching, request);

  if (namedURL === null) return linkError(request); // as built

  // 2. Rewrite. One rule applies, once, to the named URL.
  const rewritten = rewriteFetchURL(namedURL);
  const sentURL = rewritten?.url ?? namedURL;
  const isRewritten = rewritten !== null;

  // One exemption for the whole call. It compares the named URL. Section E.
  const isExempt = makeTypedExemption({ run: fetching.run, namedURL, ...fetching.secretOptions });

  const first = await runPass(fetching, sentURL, { isExempt, readsCache: !request.fresh });

  if (first.kind === 'cached') return pickPageView(first.page, view, { isCached: true });

  if (first.kind === 'ended') return toolError(first.reason); // a refusal or a failed fetch

  if (first.kind === 'paused' && !isRewritten) return toolError(pauseError(first));

  // 8. Fallback, once. Only for a rewritten URL.
  const fallsBack =
    isRewritten &&
    (first.kind === 'paused' || // step 5 met a long pause
      (first.kind === 'reply' && (first.reply.status === 404 || isRateLimitReply(first.reply))));

  if (!fallsBack) return storeReply(fetching, first.reply, sentURL, view); // 9

  // The second pass runs steps 3, 5, 6 and 7 on the named URL. It runs no step 2 and no step 4.
  // Whatever it gives is the call's outcome: a 404, a rate-limit reply and a pause error included.
  const second = await runPass(fetching, namedURL, { isExempt, readsCache: false });

  if (second.kind === 'ended') return toolError(second.reason);

  if (second.kind === 'paused') return toolError(pauseError(second));

  return storeReply(fetching, second.reply, namedURL, view); // 9, with fetch_url the named URL
}

// A reply with no blocked reason whose status is 429 or 503, or whose status is 403 with a
// retryAfterMs that is not null. A 2xx reply is never one. A failed reply is never one.
function isRateLimitReply(reply) {
  if (reply.kind !== 'page' && reply.kind !== 'image') return false;

  if (reply.blocked) return false;

  if (reply.status === 429 || reply.status === 503) return true;

  return reply.status === 403 && reply.retryAfterMs !== null;
}

// ---- B. One pass: steps 3 to 7 ----

async function runPass(fetching, sentURL, { isExempt, readsCache }) {
  // 3. Scan. Hop 0 is the sent URL. On a refusal nixie starts no sandbox and stores nothing.
  const refused = await refuseFetchURL(sentURL, { ...fetching.scan, isExempt });

  if (refused) return { kind: 'ended', reason: refused.reason };

  // 4. Cache. (open: page cache) A hit starts no sandbox and writes nothing. Section D.
  if (readsCache && fetching.config.cacheMs > 0) {
    const page = await readCachedPage(fetching.log, cacheQuery(fetching, sentURL));

    if (page) return { kind: 'cached', page };
  }

  // 5. Pause. Only the sent URL's host is read. No redirect hop is read against the map.
  const host = new URL(sentURL).host;

  const leftMs = fetching.backoff.readPause(host);

  if (leftMs > fetching.config.backoffWaitMs) return { kind: 'paused', host, leftMs };

  if (leftMs > 0) await fetching.clock.sleep(leftMs); // before the call enters the fetch queue

  // 6. Fetch, with its redirect hops. One sandbox starts. Every fetch of the tool sends hops 'ask'.
  const scanHop = makeHopScan({ ...fetching.scan, isExempt });

  const reply = await fetching.readPage(sentURL, { scanHop });

  if (reply.kind === 'refused' || reply.kind === 'failed') {
    return { kind: 'ended', reason: reply.reason }; // a tool error; sets off no fallback
  }

  // 7. Pause. Runs for every reply with a status, a 2xx reply too, and before step 8 decides.
  setPauseFromReply(fetching, reply, sentURL);

  return { kind: 'reply', reply };
}

// ---- C. Setting a pause ----

function setPauseFromReply(fetching, reply, sentURL) {
  if (reply.blocked) return; // a site's bot protection is no rate limit

  if (reply.status !== 429 && reply.status !== 503 && reply.retryAfterMs === null) return;

  // The pause is retryAfterMs, else backoff_ms, and never past backoff_cap_ms.
  const finalHost = new URL(reply.url).host;

  fetching.backoff.setPause(finalHost, reply.retryAfterMs);

  // After a redirect, the sent URL's host too, so the next call for the same URL meets the pause.
  const sentHost = new URL(sentURL).host;

  if (sentHost !== finalHost) fetching.backoff.setPause(sentHost, reply.retryAfterMs);
}

// ---- D. The cache lookup ----

// (open: page cache)
// The session's newest row that meets all 4:
// - its fetch_url or its url equals the sent URL, parsed and written back without its fragment;
// - its stored_at is inside cache_ms;
// - its status is 2xx;
// - its blocked reason is null.
// A row whose fetch_url is null hits only by its url.

// ---- E. The exemption of a call ----

// The first line that fits decides.
function makeTypedExemption({ run, namedURL, isOwnerTyped, typedURLCovers }) {
  let typed; // read once per call, and only after a match of a public rule

  return async (hop, rule) => {
    // 1. One of nixie's own values: false, at every hop. It reads no message.
    //    (open: own values exemption)
    if (rule === 'nixie-secret') return false;

    // 2. Hop 0: whether the person typed the named URL, the URL before any rewrite.
    typed ??= isOwnerTyped(run, namedURL);

    if (hop === 0) return typed;

    // 3. A hop after hop 0: the same answer under 'redirects', false under 'named_url'.
    //    (open: typed url redirects)
    return typedURLCovers === 'redirects' ? typed : false;
  };
}

// ---- F. The scan of a sent URL and of a hop ----

async function refuseFetchURL(url, { findSecret, isExempt, logger, event }) {
  const found = findSecret(url); // own values first, then the public rules

  if (found === null) return null;

  if (await isExempt(0, found.rule)) return null; // nothing is logged

  logger(event, { rule: found.rule, hop: 0 }); // no URL, no host, no secret

  return { kind: 'refused', reason: secretRefusal(found.rule) };
}

function makeHopScan({ findSecret, isExempt, logger, event }) {
  return async (hop) => {
    const found = findSecret(hop.url);

    if (found === null) return { kind: 'pass' };

    if (await isExempt(hop.number, found.rule)) return { kind: 'pass' };

    logger(event, { rule: found.rule, hop: hop.number });

    // The sentence names the host that sent the redirect, unless that host's own name matches the
    // finder. (open: hostless hop sentence)
    const namesHost = findSecret(hop.sentBy) === null;

    return { kind: 'refuse', reason: hopRefusal(namesHost ? hop.sentBy : null, found.rule) };
  };
}

// The finder, in the secret scan lib.
function makeSecretFinder(ownValues) {
  return (url) => {
    // Both forms of the URL: as given, and percent-decoded.
    // Each own value: as it is, and percent-encoded.
    if (holdsOwnValue(url, ownValues)) return { rule: 'nixie-secret' };

    // Each public rule runs with no file path, so a rule that matches on a path alone never fires.
    return findSecret(url);
  };
}

// ---- G. A gated fetch ----

// The fetcher's half. It asks after it counts the redirect and before planHop, so the fetcher
// never resolves the host of a refused hop.
async function readRedirectChain(url, options, signal) {
  const hop = { url, count: 0 };

  for (;;) {
    const step = await readHop(hop.url, options); // planHop, then the request

    if (step.kind !== 'redirect') return step;

    if (hop.count === options.redirects) return failed('the page redirected too many times');

    hop.url = step.location;
    hop.count += 1;

    if (options.askHop) await options.askHop(hop.url, signal); // waits for hop-pass
  }
}

// The server's half. It handles one frame of a fetch at a time. One time limit covers each scan.
//
//   from       on                  to         what the server does
//   reading    a hop frame         scanning   counts the hop and runs scanHop
//   scanning   a pass              reading    sends hop-pass
//   scanning   a refusal           stopped    stops the process and returns `refused`
//   reading    the reply frame     replied    returns the reply
//   any        a fault             failed     stops the process and returns `failed`
//
// A fault is one of 6: a scan that throws; more hop frames than the redirect limit; a hop frame on
// a fetch sent with hops 'none'; a frame that does not decode; a closed output; the time limit.
async function gatePageHops(stream, { sentURL, redirects, scanHop, limit }) {
  let previous = sentURL;
  let count = 0;

  for await (const frame of readGuestFrames(stream, limit)) {
    if (frame.kind !== 'hop') return frame; // the reply

    count += 1;

    if (count > redirects) return stopAndFail(stream);

    // The server counts the hops and reads the sending host from the URL before this one. It trusts
    // nothing else the guest says.
    const sentBy = new URL(previous).host;

    const verdict = await scanHop({ number: count, url: frame.url, sentBy });

    if (verdict.kind === 'refuse') {
      await stream.stop(); // the sandbox's destroy removes the fetcher's temporary directory

      return { kind: 'refused', reason: verdict.reason, isGated: true };
    }

    previous = frame.url;

    await stream.send(encodeHopPass());
  }

  return stopAndFail(stream);
}

// After the reply: a `failed` reply with isGated false to a request sent with hops 'ask' and a
// redirect limit above 0 gets the image release reason. (open: image release reason)

// ---- H. What the tool runner stores ----

function buildToolResultFields(outcome) {
  const isSet = outcome.hidden && Object.keys(outcome.hidden).length > 0;
  const hidden = isSet ? { hidden: outcome.hidden } : {};

  if (outcome.status === 'ok') return { result: outcome.record ?? outcome.result, ...hidden };

  return { message: outcome.message, ...hidden }; // an error the tool returns
}

// Every other outcome stores { message }. The model's reply holds the result or the message alone.

// ---- I. What log.read prints for a tool entry ----

async function formatToolText(fields, payload, rows) {
  if (fields === null) return null;

  // Only 2 keys print: `result` and `message`. `hidden` and every other key are omitted.
  if (typeof fields.message === 'string') return JSON.stringify({ message: fields.message });

  let result = fields.result;

  // A stored cost inside `result`: dropped when the payload's `sources` do not name costUSD.
  // A payload that does not decode counts as naming no source.
  if (!namesSource(payload, 'costUSD')) result = omitKey(result, 'costUSD');

  // A UUID-shaped value under momentID, itemID or changeID, at any depth: the short ID from the
  // row of the moment, the item or the change. When the row gives none, the key is omitted.
  // (open: omitted entry) A lookup that throws fails the log.read call. It never prints the UUID.
  // (open: stored uuid rule) (open: change rows)
  result = await swapUUIDs(result, rows);

  return JSON.stringify({ result });
}

// A word search in log.read matches this printed text, so it never matches a hidden value.
