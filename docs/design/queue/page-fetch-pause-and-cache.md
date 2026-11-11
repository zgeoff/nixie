# The pause per host and the page cache

A host that answers the web fetch tool with a rate limit gets a pause before the next fetch, so
nixie stops spending requests on refusals. A page that the session fetched moments ago comes back
from its stored copy with no fetch. Both decide whether a call reaches the network at all, and both
are steps of [the flow of a page fetch](page-fetch.md). That doc defines the named URL, the sent
URL, the rewritten URL, the rate-limit reply and the second pass. In short: a rule can rewrite the
URL that a call gives, the named URL, to a cleaner one, the rewritten URL; the sent URL is the one
that goes to the fetcher; and the second pass fetches the named URL when the rewritten URL fails.

This doc holds the rules. The files in `sketches/web/` hold the TypeScript shapes and the exact text
of each error, and a "Shape", "Flow", "Usage" or "Text" line points at the section of one. The
[glossary](../../glossary.md) holds the terms that this doc does not define. A rule that ends with
`(open: <name>)` is the intended design and is not settled: [the open list](open/web.md) holds the
item of that name, with its options and its issue. Whether nixie has a cache at all waits for your
decision. (open: page cache)

This doc uses the step numbers of the flow: step 3 is the secret scan, step 4 the cache lookup, step
5 the pause read, step 6 the fetch, step 7 the setting of a pause, step 8 the second pass, and step
9 the store of the page.

## Built

The code on the main branch does this. Every section after this one is design.

- A call of the web fetch tool holds one of 3 inputs. `url` is a URL. `link` is the ID of a link
  that a page showed. `page` is the ID of a stored page. Every `url` or `link` call fetches: the
  code has no cache.
- Fetches go through one queue, one at a time. nixie destroys each fetch sandbox after its fetch, so
  the sandbox holds nothing between 2 fetches.
- A `FetchReply` carries the status and the body of a reply, and none of its headers. Its decoder
  reads its listed fields and skips the rest.
- The fetcher is the program in the fetch sandbox that sends the request. It reads a bot challenge
  on a 403 or a 503 and reports it in the reply's `blocked` field, the blocked reason.
- The page store, `web_fetch_pages`, holds a page under its final URL, with `stored_at`.
  `writeWebFetchPage` writes the page and its links in one transaction and checks for a forget
  inside it. It stores a row only for a page with text.
- `removeWebFetchThread` deletes every page row and link row of a thread. The session cleanup and
  the conversation reset call it.
- The `web_fetch` config section is a strict object, so nixie refuses a config with a key that the
  section's schema lacks. `startWebFetch` takes the section as its `config` option.

## The wire field

The `page` and `image` members of `FetchReply` hold `retryAfterMs`. Shape:
[the reply on the wire](sketches/web/02-types.ts), section C.

- The fetcher sets it from `Retry-After`, as seconds or as a date, on a 429, a 503 or a 403.
- The fetcher sets it from `x-ratelimit-reset` when `x-ratelimit-remaining` is `0`, on any status.
  That header is a time in seconds since 1970.
- A `Retry-After` date and a reset time are both times. The fetcher subtracts its own clock and
  sends the difference, never less than 0.
- A value that the fetcher cannot parse gives null.
- A reply with neither header gives null. (open: retry header order)
- The decoder reads a missing field as null.

## The config keys

4 keys of the `web_fetch` section, each a whole number of 0 or more: `backoff_ms`, `backoff_cap_ms`,
`backoff_wait_ms` and `cache_ms`. Shape: [the keys and their defaults](sketches/web/02-types.ts),
section H. Usage: [the section at its defaults](sketches/web/01-usage.ts), section E.

- `backoff_ms` is the pause when the reply holds none. Its default is 30 seconds.
- `backoff_cap_ms` is the longest pause, whatever the reply holds. Its default is 5 minutes.
- `backoff_wait_ms` is the longest pause that a call waits out itself. Its default is 5 seconds.
- `cache_ms` is how long nixie returns a stored page for a fetch of its URL. Its default is 5
  minutes, and 0 turns the lookup off. (open: page cache)

## The pause

**A pause** is a length of time in which nixie sends no fetch to one host. The state is a map from a
host to the time its pause ends, in the memory of the server process, behind `makeFetchBackoff` of
the connectors module. nixie stores no pause in the database: a table of host names would be one
more place that a forget must erase, and a lost pause costs one wasted request. Shape:
[the pause map](sketches/web/02-types.ts), section J. Flow:
[reading and setting a pause](sketches/web/03-flow.ts), sections B and C.

Step 5, before a fetch:

- nixie reads the pause of the sent URL's host.
- When the pause is `backoff_wait_ms` or less, the call waits it out before it enters the fetch
  queue, so it never holds up a fetch of another host.
- When the pause is longer and the sent URL is a rewritten URL, the call takes the second pass.
- When the pause is longer and the sent URL is the named URL, the call ends with the pause error, a
  tool error with the host and the seconds left. nixie stores nothing. Text:
  [the pause error](sketches/web/02-types.ts), section L.

Step 7, after every reply of a fetch:

- nixie sets a pause for a reply that has a status and no blocked reason, when the status is 429 or
  503, or `retryAfterMs` is not null.
- The pause is `retryAfterMs`, and `backoff_ms` when that is null. It never passes `backoff_cap_ms`.
- The pause goes on the host of the reply's final URL. When the fetch followed a redirect, it goes
  on the sent URL's host too, so the next call for the same URL meets the pause.
- Step 7 runs before nixie decides on a second pass, so the reply of a rewritten URL sets its pause
  before the second pass.

The rules:

- A 200 that used the last request of a limit carries a `retryAfterMs`. nixie returns and stores
  that page, and pauses its host, so the next call spends no request on a refusal. Such a reply sets
  off no second pass.
- A reply with a blocked reason sets no pause, because a site's bot protection is not a rate limit.
- GitHub's API answers a spent limit with 403 and `x-ratelimit-remaining: 0`. That reply sets a
  pause, and on a rewritten URL it sets off the second pass.
- nixie reads the pause of the sent URL's host alone. It never reads a redirect hop against the map,
  so a fetch that another host redirects into a paused host goes out and costs one more rate-limit
  reply.
- A second pass that meets a pause longer than `backoff_wait_ms` ends with the pause error. A second
  pass that gets a rate-limit reply pauses that host too and returns the reply.
- A restart of the server drops every pause, which costs one more rate-limit reply.
- A forget clears the map, because a host name can show what a forgotten conversation read. (open:
  forget clears pauses)

## The cache

The cache is the page store: it adds no second store. The session key, the thread, the store limit
and every removal apply to a cached page as to any stored page. nixie has the rules of this section
only when your decision is to have a cache. (open: page cache) Shape:
[the input, the result and the column](sketches/web/02-types.ts), section K. Usage:
[a stored copy and `fresh`](sketches/web/01-usage.ts), section B.

- **Input.** `fresh` is a boolean, allowed with `url` or `link`. `fresh: true` skips the stored
  copy. nixie refuses `fresh` with `page`. (open: fresh with page text)
- **Output.** `isCached` is a required boolean of the tool's result. Its schema marks it
  `x-endorsed`, as the result's `status` is. It is true when a `url` or `link` call returned a
  stored copy. The model cannot tell a stale copy of a changing page without it.
- **The column.** `web_fetch_pages` holds `fetch_url`, nullable text: the sent URL of the pass that
  stored the row. `writeWebFetchPage` stores it with the row in step 9.

Step 4, the lookup, for a `url` or `link` call without `fresh`:

- nixie looks up the session's newest row that meets 4 conditions: its `fetch_url` or its `url`
  equals the sent URL; its `stored_at` is inside `cache_ms`; its status is 2xx; its blocked reason
  is null. Flow: [the lookup](sketches/web/03-flow.ts), section D.
- For the comparison, nixie takes the sent URL without its fragment, in the form that the URL parser
  prints, and compares that text with the stored values.
- On a hit, nixie returns the row through `pickPageView` with `isCached: true`. It starts no sandbox
  and writes nothing.
- A miss goes on to step 5.

The rules:

- The pause read runs after the cache, so a stored page of a paused host returns.
- A URL that the secret scan refuses never reaches the cache, because step 3 runs first.
- The second pass never runs step 4, so it never returns a stored copy.
- A second pass sends the named URL, so the row it stores holds the named URL in `fetch_url`. The
  next call for the same page sends the rewritten URL, misses the cache, and goes on to step 5. That
  miss is an accepted cost.
- A row whose `fetch_url` is null hits only by its `url`, the final URL of its fetch.
- An image, a page with no text and a failed fetch store no row, so none can hit.
- 2 calls for one URL at the same moment both miss and both fetch.
- A cached page is a row of `web_fetch_pages`, and `removeWebFetchThread` deletes every row of the
  thread. A forget needs nothing more.
- `cache_ms: 0` turns the lookup off.

## Not in scope

- A cache across sessions or threads.
- A cache of an image, a page with no text or a failed fetch.
- A pause for the fetches of the skill file reader, which fetches a skill's files through its own
  fetch sandbox.
- A pause that survives a restart of the server.
- A read of each redirect hop against the pauses.
- A retry of a blocked page in a headless browser.
