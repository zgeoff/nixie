# Web: the page fetch work as slices

The slices are in dependency order. Slices 5 to 11 are here, all of milestone 4. Slices 1 to 4 are
in [the web slices](web.md). Most slices here wait for your choices in
[the open list](../open/web.md). Each "Needs" line is a settled dependency. The order between slices
that only share code is not settled: (open: web slice order).

The docs are [the flow of a page fetch](../page-fetch.md),
[the pause per host and the page cache](../page-fetch-pause-and-cache.md),
[the refusal of a URL that carries a secret](../secret-url-refusal.md) and
[the hop gate](../secret-url-hops.md). The sketches are in `../sketches/web/`.

Run `bun run models && bun run test:bundles` once before the unit tests of a slice, from the repo
root. Tests are in the unit lane unless marked. A lane that skips its tests has not passed.

3 slices change `runPageFetch`, in this order: slice 6, then slice 9, then slice 10. After slice 6,
`runPageFetch` is the step list with steps 1, 2, 6, 8 and 9, and the fallback runs on a 404, a 429
and a 503. Slice 9 puts step 3 and the hop scan of step 6 in the list. Slice 10 puts steps 5 and 7
in it. Slice 11 puts step 4 in it. 4 files are shared by slices 6, 9, 10 and 11, so their changes
land one slice at a time: the tool's file, `startWebFetch`, the web fetch config schema with its
defaults, and the web fetch architecture doc.

Each slice has the ID `web-<n>`, which is unique across the queue, and each "Needs" names a slice by
its ID. In any other field of this file, "slice n" means `web-n`. [The work list](../work-list.md)
gives the build order.

### web-5. The `retryAfterMs` wire field

[The back-off and cache issue](https://linear.app/zgeoff/issue/GEO-2244).

- **Outcome:** The `page` and `image` members of `FetchReply` hold `retryAfterMs`, the fetcher sets
  it from the 2 headers, and the decoder reads a missing field as null.
- **Follows:** "The wire field" in the pause and cache doc; `02-types.ts`, section C.
- **Needs:** nothing. The rule of (open: retry header order). It shares no file with web-6, web-9,
  web-10 and web-11. web-8 adds a field to `FetchReply` and its decoder too: the second to land
  rebases on the first.
- **Check:** `bun test guests/fetch/src/read-response-page.test.ts`, a file that this slice creates,
  and `bun test libs/wire/src/decode-fetch-reply.test.ts`: `retryAfterMs` from each header, and null
  from a reply that lacks the field.
- **Milestone:** 4. The field reaches production with the fetch image of its release. A release
  before the field reads a reply that holds it, and a server of this release reads the reply of an
  image without it as `retryAfterMs: null`. So the server and the fetch image roll in either order.

### web-6. The step list and the URL rewrite

[The URL rewrite issue](https://linear.app/zgeoff/issue/GEO-2243).

- **Outcome:** `rewriteFetchURL` exists with its rules. `runPageFetch` is a list of named steps with
  steps 1, 2, 6, 8 and 9. The fetcher sends the markdown-first `Accept` header. The tool's
  description holds the rewrite sentence. The web fetch architecture doc states the rules, the
  fallback and the header.
- **Follows:** all of the page fetch doc; `02-types.ts`, sections A and B; `03-flow.ts`, section A;
  `01-usage.ts`, section A.
- **Needs:** nothing. The 403 arm of a rate-limit reply reads `retryAfterMs`, which web-5 delivers:
  without web-5 the arm never holds, and its test is in web-10. (open: 403 fallback) (open: branch
  slash) decides whether the `github-tree` rule ships. (open: wikipedia path) decides the path of
  the `wikipedia-article` rule. (open: description sentence) is the builder's to write. The rule
  file and the header share no file with another slice.
- **Check:**
  - `bun test modules/connectors/src/rewrite-fetch-url.test.ts`, a file that this slice creates: one
    test per rule, one for a URL that matches no rule, one for a URL with a query string.
  - `bun test modules/connectors/src/build-web-fetch-tool.test.ts`, on the stub fetcher: the fetcher
    receives the rewritten URL; a 404 on the rewritten URL fetches the named URL, and the page row
    is the named URL's, when it has text; a 429 on the rewritten URL fetches the named URL and
    returns its page; a 200 on the rewritten URL returns that reply and fetches nothing more; a
    named URL that is rate-limited in the second pass returns that reply, with no third fetch; a 403
    with a blocked reason sets off no fallback; a forget that lands while the fetch runs writes no
    row.
  - `bun test guests/fetch/src/read-page.test.ts`: the request carries the `Accept` header, and a
    `text/markdown` reply returns as text.
  - `bun run test:imp apps/server/src/start-web-fetch.imp.test.ts`, by hand on a host with a real
    sandbox runtime, with the variables of
    [the imp isolation runbook](../../../runbooks/imp-isolation-tests.md): the fetch image built
    from the pull request reads `https://example.com/`, as the file's first test does.
- **Milestone:** 4. The header reaches production with the fetch image of its release. The server
  and the image roll in either order: a server of this release on an image of the release before
  only lacks the header.

### web-7. The secret scan lib

[The secret refusal issue](https://linear.app/zgeoff/issue/GEO-2246).

- **Outcome:** `libs/secret-scan` exists with `findSecret`, `makeSecretFinder`, the builder script,
  the generated rule file, the pin check and the `server-only` tag. `re2js` is in the root catalog,
  and `.gitleaks.toml` allows the rule file.
- **Follows:** "The secret scan lib" in the secret refusal doc; `02-types.ts`, section G;
  `03-flow.ts`, section F.
- **Needs:** nothing. (open: betterleaks pin). It shares no file with another slice.
- **Check:**
  - `bun test libs/secret-scan`, tests that this slice creates: one test per rule family, with a key
    in the path and in the query; a URL that holds an own value; hostile input on each `re2js` rule
    in linear time.
  - `bun test libs/secret-scan/src/find-secret.test.ts`: a list of ordinary URLs that pass: each
    rewrite target of section A of `02-types.ts`, a URL with a 40-character commit hash, one with a
    UUID, and one with a long opaque query value.
  - `bun test libs/secret-scan/src/make-secret-finder.test.ts`: a URL that holds an own value and a
    key of a public rule reports `nixie-secret`.
- **Milestone:** no deploy.

### web-8. The hop gate

[The secret refusal issue](https://linear.app/zgeoff/issue/GEO-2246).

- **Outcome:** The wire lib holds `hops`, `hopGate`, the hop frames, `isGated` and `makeHopAsker`.
  The fetcher asks before each hop. The connectors module holds `makeHopScan`, `gatePageHops` and
  the optional `scanHop` of `readPage`. No caller passes a `scanHop`, so every fetch sends
  `hops: 'none'`.
- **Follows:** all of the hop gate doc but "The skill file reader"; `02-types.ts`, sections C to F;
  `03-flow.ts`, section G.
- **Needs:** nothing. Your choice in (open: hop scan place), and the text of (open: image release
  reason). (open: sandbox frames) runs with web-9 and can end this design. web-5 adds a field to
  `FetchReply` too: the second to land rebases.
- **Check:**
  - `bun test modules/connectors/src/gate-page-hops.test.ts`, a file that this slice creates, with a
    stub `HopScan`: a refused hop gets no pass frame; a hop frame past the redirect limit fails the
    fetch; each of the 5 state moves ends in its state.
  - `bun test guests/fetch/src/read-page.test.ts` and `bun test libs/wire`: the fetcher asks before
    it resolves a hop's host; `hops: 'none'` encodes as the frame on `origin/main`.
  - `bun test modules/connectors/src/start-fetch-sandbox.test.ts`, on the stub fetcher: a fetch with
    2 redirects exchanges 2 `hop` and 2 `hop-pass` frames on one stream and returns the page with
    `isGated: true`; a `failed` reply with `isGated: false` to a gated request gets the image
    release reason. (open: image release reason)
- **Milestone:** no deploy. The frames reach production with slice 9.

### web-9. The refusal in the tool

[The secret refusal issue](https://linear.app/zgeoff/issue/GEO-2246).

- **Outcome:** `runPageFetch` runs step 3 and passes a `scanHop` in step 6. `refuseFetchURL`,
  `makeTypedExemption`, the `isOwnerTyped` builder, `collectOwnValues`, the 4 `secret_*` keys, the 3
  options of `startWebFetch` and the skill reader's wrapper exist. The web fetch architecture doc
  states the scan, the refusal sentences, the exemption, the 4 keys and the hop exchange.
- **Follows:** "The config keys" through "What never reaches a sandbox" in the secret refusal doc;
  "The skill file reader" in the hop gate doc; `02-types.ts`, sections F, H, I and L; `03-flow.ts`,
  sections B, E and F; `01-usage.ts`, sections D to F.
- **Needs:** web-6, web-7, web-8. web-6 lands first because the scan reads the rewritten URL. Your
  choices: (open: typed text), (open: typed url redirects), (open: own values exemption), (open: own
  value entries), (open: own value length), (open: skill file scan), (open: refused url record),
  (open: log event host). Text: (open: hostless hop sentence). Signatures: (open: unwritten shapes).
  The headless retry of a blocked page waits for this slice, because it scans each navigation.
- **Check:**
  - `bun test modules/connectors/src/build-web-fetch-tool.test.ts`: a refused URL starts no sandbox
    and logs the event with hop 0; the same URL typed in your message runs, logs no event, and
    stores the page's row; a fetch with no match never calls `isOwnerTyped`; a clean typed URL that
    redirects to a URL with a key runs under `redirects`, and is refused under `named_url` with the
    hop's number in the event; a typed URL that holds an own value is refused with the rule
    `nixie-secret`, starts no sandbox and never calls `isOwnerTyped`; a clean typed URL that
    redirects to a URL with an own value is refused under `redirects` too, with the rule
    `nixie-secret` and the hop's number in the event.
  - `bun test modules/connectors/src/gate-page-hops.test.ts`, with the real `makeHopScan`: a hop
    with a key and a hop with an own value are each refused with no pass frame sent.
  - `bun run test:imp apps/server/src/start-web-fetch.imp.test.ts`, by hand on a host with a real
    sandbox runtime, with the variables of
    [the imp isolation runbook](../../../runbooks/imp-isolation-tests.md), and never against a
    production deployment. 2 tests that this slice adds, on the fetch image built from the pull
    request, at the `fetch` row of [the sandbox size table](../sandbox-sizes.md). First: a
    `web_fetch` call for `https://wikipedia.org/`, which answers 301 to
    `https://www.wikipedia.org/`, returns a page whose `url` is the second URL, and a recording
    `findSecret`, passed to `startWebFetch`, has been asked about the first URL and then the second,
    and nothing else. Second: the same call with a `findSecret` that matches the second URL returns
    the hop's refusal, and the sandbox is destroyed. These 2 tests are the check of (open: sandbox
    frames) and of (open: fetch memory).
- **Milestone:** 4. Deploy the fetch image with the server: a server of this release on an image of
  the release before reads a page with no redirect and fails every redirected page. A server of the
  release before on this image sends no `hopGate`, so the image sends no hop frame and follows
  redirects unscanned, as that release does. Rollback: a release before the 4 keys refuses a config
  that holds any of them, so take them out first. Each key has a default.

### web-10. The pause per host

[The back-off and cache issue](https://linear.app/zgeoff/issue/GEO-2244).

- **Outcome:** `makeFetchBackoff` exists. `runPageFetch` runs steps 5 and 7, and a pause longer than
  `backoff_wait_ms` on a rewritten URL sets off the second pass. The 3 `backoff_*` keys exist. A
  forget clears the map. (open: forget clears pauses)
- **Follows:** "The config keys" and "The pause" in the pause and cache doc; `02-types.ts`, sections
  H, J and L; `03-flow.ts`, sections B and C; `01-usage.ts`, section C.
- **Needs:** web-5, web-6. The pause's host is the sent URL's, which web-6 makes. It lands after
  web-9 when that one is approved. (open: web slice order) (open: unwritten shapes) holds the
  signature of `makeFetchBackoff`.
- **Check:**
  - `bun test modules/connectors/src/build-web-fetch-tool.test.ts`, on the stub fetcher and a fake
    clock:
    - a 429 with `Retry-After` refuses the next fetch of that host and not of another;
    - a 429 after a redirect from a second host refuses the next fetch of each of the 2 hosts;
    - a pause of `backoff_wait_ms` or less waits on the fake clock;
    - a URL with no rewrite that answers 429 returns the reply;
    - the next call for that host waits when the pause left is `backoff_wait_ms` or less, and gets
      the pause error when it is longer;
    - a rewritten URL that answers 403 with a spent limit pauses its host, and the call returns the
      named URL's page and stores its row;
    - the same call again, inside that pause, starts 1 sandbox and sends no request to the rewritten
      URL's host;
    - a rewritten URL whose host is paused fetches the named URL;
    - a 200 on a rewritten URL whose reply holds a `retryAfterMs` pauses its host, sets off no
      fallback, and stores the rewritten URL's page row;
    - a rewritten URL that answers 404 sets no pause;
    - a fallback whose named URL is rate-limited too sets 2 pauses and returns that reply, with no
      third fetch;
    - a 403 that is a bot challenge sets no pause and no fallback.
  - `bun test modules/connectors/src/web-fetch-config-schema.test.ts`: each key and its default.
  - `bun test modules/connectors/src/make-fetch-backoff.test.ts`, a file that this slice creates: a
    pause never passes `backoff_cap_ms`, and a reply with a blocked reason sets none.
- **Milestone:** 4. No migration. Rollback: a release before the keys refuses a config that holds
  any of them, however many releases back it is. Take the keys out of the config before a rollback.
  Each key has a default, so a config without them loads on every release.

### web-11. The page cache

[The back-off and cache issue](https://linear.app/zgeoff/issue/GEO-2244).

- **Outcome:** `web_fetch_pages` holds `fetch_url`, `runPageFetch` runs step 4, the tool takes
  `fresh` and returns `isCached`, and `cache_ms` exists. The call table of the web fetch
  architecture doc states the cache, `fresh` and `isCached` in place of "always fetches".
- **Follows:** "The cache" in the pause and cache doc; `02-types.ts`, sections H and K;
  `03-flow.ts`, sections B and D; `01-usage.ts`, section B.
- **Needs:** web-10. Your choice in (open: page cache). Under option (a) this slice is not built.
  (open: fresh with page text) is the builder's to write. The migration and the lookup share no file
  with another slice.
- **Check:**
  - `bun test modules/connectors/src/build-web-fetch-tool.test.ts`: a second fetch of one URL inside
    `cache_ms` starts no sandbox and returns `isCached: true`, and `fresh: true` starts one; a
    stored page of a paused host returns the stored copy.
  - `bun test modules/connectors/src/remove-web-fetch-thread.test.ts`: after a forget, a fetch of a
    cached URL starts a sandbox.
  - `bun test modules/connectors/src/web-fetch-config-schema.test.ts`: `cache_ms` and its default.
- **Milestone:** 4. The migration adds the column `fetch_url` only, so `oldestReader` of the schema
  is the same after it. A row that a release before the migration wrote holds null and hits only by
  its final URL. Rollback: take `cache_ms` out of the config first. A release that has the page
  store starts on the added column, because it names its columns on insert.
