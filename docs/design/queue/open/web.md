# Web: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`, and the name is the bold text of the
item here. The docs are [the flow of a page fetch](../page-fetch.md),
[the pause per host and the page cache](../page-fetch-pause-and-cache.md),
[the refusal of a URL that carries a secret](../secret-url-refusal.md),
[the hop gate](../secret-url-hops.md), [the tool entry of `log.read`](../search-cost-records.md) and
[short IDs in tool records](../short-ids.md). The sketches are in `../sketches/web/`. Slices 1 to 4
are in [the web slices](../slices/web.md), and slices 5 to 11 in
[the web fetch slices](../slices/web-fetch.md).

The issues: [the URL rewrite issue](https://linear.app/zgeoff/issue/GEO-2243),
[the back-off and cache issue](https://linear.app/zgeoff/issue/GEO-2244),
[the secret refusal issue](https://linear.app/zgeoff/issue/GEO-2246),
[the search cost issue](https://linear.app/zgeoff/issue/GEO-2494),
[the refused search issue](https://linear.app/zgeoff/issue/GEO-2496) and
[the short ID issue](https://linear.app/zgeoff/issue/GEO-2528).

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 3: stored uuid readers; in part: change rows (the memory gate list); stored uuid rule.
- Slice 4: proposal short id.
- Slice 5: retry header order.
- Slice 6: in part: branch slash; wikipedia path; description sentence.
- Slice 7: betterleaks pin.
- Slice 8: hop scan place; sandbox frames; image release reason.
- Slice 9: typed text; typed url redirects; own values exemption; refused url record; own value
  entries; own value length; skill file scan; log event host; hostless hop sentence; unwritten
  shapes.
- Slice 10: unwritten shapes; in part: forget clears pauses.
- Slice 11: page cache; fresh with page text; unwritten shapes.

## Not decided

Each waits for you. "Intended" is the option the docs follow.

- **page cache.** Milestone 4. Blocks slice 11. The built rule is that a `url` or `link` call always
  fetches. Options: (a) no cache, and the pause alone; (b) the cache, on by default at 5 minutes,
  and the rule goes from the web fetch doc; (c) the cache with `cache_ms: 0` as the default.
  Intended: (b), because `isCached` shows the model that a result is a stored copy, and `fresh`
  fetches anyway.
- **forget clears pauses.** Milestone 4. Blocks part of slice 10. Options: (a) a forget clears the
  map of paused hosts; (b) each pause ends on its own, within `backoff_cap_ms`. Intended: (a),
  because a host name can show what a forgotten conversation read.
- **hop scan place.** Milestone 4. Blocks slice 8. Where nixie scans each hop's URL. Options: (a)
  the server passes each hop on the fetch's open stream; (b) the public rules inside the fetcher,
  and the own values on the sent URL only; (c) a sandbox for each hop. Intended: (a), the only one
  that scans every hop against the own values, and it starts no sandbox.
- **typed text.** Milestone 4. Blocks slice 9. Which text counts as typed for the exemption.
  Options: (a) typed spans of the turn's own message; (b) typed spans of the thread's newest 50
  readable messages; (c) the same, pasted spans too. Intended: (b), because a paste can hold text
  that someone else wrote, and a forgotten message does not count.
- **typed url redirects.** Milestone 4. Blocks slice 9. The key `secret_typed_url_covers`. Options:
  (a) only the named URL is exempt; (b) nixie scans every hop of that fetch, and a hop that matches
  a public rule passes. Intended: (b), because a site that redirects a typed URL with its token
  fails under (a).
- **own values exemption.** Milestone 4. Blocks slice 9. Options: (a) a typed URL that holds an own
  value runs, and so does a hop of its fetch under `redirects`; (b) nixie refuses it, at the named
  URL and at every hop, whatever the value of `secret_typed_url_covers`; (c) nixie refuses it at the
  named URL, and a hop that holds one passes under `redirects`. Intended: (b). It is line 1 of the
  exemption.
- **refused url record.** Milestone 4. Blocks slice 9. Options: (a) the call record holds the
  refused URL; (b) the tool's `recordInput` stores the rule in its place. Intended: (a), because the
  secret sits in the session that the model read it from, so (b) hides one copy.
- **own value entries.** Milestone 4. Blocks slice 9. The key `secret_own_values`. Options: (a)
  every string of the secrets file; (b) the 5 credential entries. Intended: (b), because `settings`
  holds your name and pronouns.
- **own value length.** Milestone 4. Blocks slice 9. The key `secret_own_value_min_chars`. Options:
  (a) any length; (b) 8 characters or more. Intended: (b), because a short value matches by chance.
- **skill file scan.** Milestone 4. Blocks slice 9. The key `secret_scan_skill_files`. Options: (a)
  nixie scans none of the skill file reader's fetches; (b) it scans them too. Intended: (b), because
  the hop gate puts the scan where both readers pass.
- **log event host.** Milestone 4. Blocks slice 9. Options: (a) the log event holds the rule and the
  host; (b) the rule and the hop's number alone. Intended: (b), because the server log is outside a
  forget's reach.
- **proposal short id.** Milestone 1. Blocks slice 4. A proposal row has no short ID column, and no
  rule gives where a proposal's short ID comes from. Options: (a) a `short_id` column on the
  proposal row, added by a migration, as memory items have; (b) a short ID derived from the UUID on
  each read, with no column. No option is intended. The same choice decides 2 more things: what
  `log.read` shows for a stored `proposalID` that is a UUID, and whether the `proposalID` in the
  results of `memory.remember`, `memory.edit`, `memory.retire` and `memory.pin` is a short ID.
- **web slice order.** Milestone 4. Blocks no slice. These orders have no stated reason: the refusal
  in the tool (slice 9) before the pause (slice 10), and the split of each slice into pull requests.
  The "Needs" lines of the slices are settled.

## Not checked

- **branch slash.** Milestone 4. Blocks part of slice 6. A branch name with a slash, on the
  `github-tree` rule. Run
  `curl -s -o /dev/null -w '%{http_code}' 'https://api.github.com/repos/<owner>/<repo>/contents/<path>?ref=<first_segment>'`
  for a public repo with a branch whose name holds a slash. `<first_segment>` is that name up to its
  first slash, and `<path>` starts with the rest of it. 404: the fallback reads such a tree page,
  and the rule ships. 200: the API read another ref, so the rule would return the wrong branch's
  files, and slice 6 ships without the `github-tree` rule. The other 4 rules do not wait.
- **wikipedia path.** Milestone 4. Blocks part of slice 6. Read Wikimedia's API docs for
  `/w/rest.php/v1/page/<title>/html`. The docs list it as supported: the rule stands. The docs list
  `/api/rest_v1/page/html/<title>` as the supported path: the rule fetches that one. Both return the
  same HTML.
- **sandbox frames.** Milestone 4. Blocks slice 8. A real sandbox carries several frames each way
  for the fetch image. Only the stub and the conversation guest show it. Run the 2 imp tests of
  slice 9, and have the test print the time from each `hop` frame to its `hop-pass`. Both pass: the
  hop gate stands, and the printed time is what a redirect costs. A real sandbox cannot carry the
  exchange: stop, because **hop scan place** returns to you.
- **fetch memory.** Milestone 4. Blocks no slice. The fetch fits its memory limit with the hop
  exchange. Run the same 2 tests at the `fetch` row of [the sandbox size table](../sandbox-sizes.md)
  and read the guest's `memory.events` after each. `oom_kill 0`: that row fits the fetch. A kill:
  report it against the size table, which owns the figure. This check gates no slice.
- **betterleaks pin.** Milestone 4. Blocks slice 7. Clone `github.com/betterleaks/betterleaks`,
  check out commit `81aff7a`, and read its licence file and its rule file. The licence is MIT and
  the rules are there: pin that commit. Either differs: pin the commit that was read, and state the
  licence that was found in the pull request.
- **stored uuid readers.** Milestone 1. Blocks slice 3. Whether server code reads a UUID out of a
  stored `result`. Run
  `git grep -n -e 'result\.momentID' -e 'result\.itemID' -e 'result\.changeID' -e 'result\.proposalID' -- modules apps`,
  then read each caller of the `tool_result` codec's `decode` outside `readLogPage`. Each printed
  line is a candidate. A reader is code that reads the stored fields of a `tool_result` record of
  one of the 8 tools. No reader: the tools move their UUIDs to `hidden.uuids` as written. A reader:
  slice 3 moves it to `hidden.uuids`.
- "change rows" is filed once, in [the memory gate list](memory-gate.md#not-checked).

## Not written

- **fresh with page text.** Milestone 4. Blocks slice 11. The tool error for a call with `fresh` and
  `page`. The intended rule: nixie refuses the call, and the sentence holds that `fresh` goes with
  `url` or `link`.
- **hostless hop sentence.** Milestone 4. Blocks slice 9. The hop refusal when the sending host's
  own name matches the finder. The intended rule: the sentence holds the rule and no host.
- **image release reason.** Milestone 4. Blocks slice 8. The reason that replaces a `failed` reply
  with `isGated: false` to a gated request. The intended content: the fetch image is of a release
  before the server's.
- **description sentence.** Milestone 4. Blocks part of slice 6. The sentence of the web fetch
  tool's description about a rewrite. The intended content: a page of a known site comes back in its
  raw or JSON form, and `url` shows what nixie fetched.
- **unwritten shapes.** Milestone 4. Blocks slices 9, 10 and 11. The source holds these names and no
  signature for them: `makeFetchBackoff`, the lookup of the cache, `collectOwnValues`, the builder
  of `isOwnerTyped` and `makeTypedExemption`. The head of `02-types.ts` lists them, and the sketch's
  signatures are its own reading. The rounding of the seconds in the pause error is not written
  either. The intended rule: a whole number, rounded up.
- **omitted entry.** Milestone 1. Blocks no slice. When the row gives no short ID, the source has
  `log.read` omit "the key or the entry". When it omits a whole list entry in place of the one key
  is not written. The docs omit the key.
- **retry header order.** Milestone 4. Blocks slice 5. Which header gives `retryAfterMs` when a
  reply holds both `Retry-After` and a spent `x-ratelimit-reset`. No rule is stated. Slice 5 waits
  for it.

## Known faults

- **stored uuid rule.** Milestone 1. Blocks part of slice 3. What `log.read` shows for a UUID in a
  stored record is stated 2 ways. One statement gives it as a choice that waits for you, with 3
  options: (a) the short ID, read from the row, and the key omitted when the row gives none; (b) the
  key omitted always; (c) the UUID. Another states (a) as the rule. The docs follow (a).
- **403 fallback.** Milestone 4. Blocks no slice. By one statement, the URL rewrite needs nothing
  and lands first. Another makes a 403 with a `retryAfterMs` a rate-limit reply, and `retryAfterMs`
  arrives with the pause. The slices follow this reading: the wire field is slice 5, slice 6 builds
  the 403 arm, the arm never holds on a reply without the field, and the test of the 403 arm is in
  slice 10.
- **page reader port.** Milestone 4. Blocks no slice. [Port rules](../port-rules.md) lists
  `ReadPage`, in the skills module, as the page reader of web fetch and one of the 5 ports of the
  queue design. [The flow of a page fetch](../page-fetch.md) has no `PageReader` object or port in
  front of `readPage` and never names `ReadPage`. [The refusal](../secret-url-refusal.md) ties the
  1-argument `ReadPage` to the skill file reader. The web docs follow the second: the fetch tool
  calls `readPage` with no port between.
