# Web: the work of milestone 1 as slices

The slices are in dependency order. Slices 1 to 4 are here: the `hidden` field, the search's cost
and the short IDs. They are settled, but for the open items they name in
[the open list](../open/web.md). Slices 5 to 11, the page fetch work of milestone 4, are in
[the web fetch slices](web-fetch.md). Each "Needs" line is a settled dependency.

The docs are [the tool entry of `log.read`](../search-cost-records.md) and
[short IDs in tool records](../short-ids.md). The sketches are in `../sketches/web/`.

Run `bun run models && bun run test:bundles` once before the unit tests of a slice, from the repo
root. Tests are in the unit lane unless marked. A lane that skips its tests has not passed.

Each slice has the ID `web-<n>`, which is unique across the queue, and each "Needs" names a slice by
its ID. In any other field of this file, "slice n" means `web-n`. [The work list](../work-list.md)
gives the build order.

### web-1. `hidden` on an ok outcome, and the search's cost

[The search cost issue](https://linear.app/zgeoff/issue/GEO-2494).

- **Outcome:** `DirectResult` holds the optional `hidden`, the tool runner stores it beside
  `result`, the search tool returns its cost under `hidden` and no `record`, and `log.read` prints
  only `result` and `message` of a tool entry, without a `costUSD` that the sources do not name. 3
  architecture docs state it: tool calls states the 3 fields of an outcome and which the model reads
  back; search states that a paid search records its cost under `hidden`, without the sentence
  "shows the whole record"; reading the log states that a tool entry shows `result` or `message`
  alone.
- **Follows:** "The `hidden` field" through "What you see" in the tool entry doc, for the ok member;
  `02-types.ts`, section M; `03-flow.ts`, sections H and I; `01-usage.ts`, sections G and H.
- **Needs:** nothing.
- **Check:**
  - `bun test modules/memory/src/read-log-page.test.ts`: a search's entry holds no cost, for a
    record with `hidden` and for a record with `costUSD` inside `result`. The entries of `log.read`
    and `skill_pending` read as on `origin/main`.
  - `bun test modules/tools/src/run-tool-call.test.ts`: an ok outcome with `hidden` stores it beside
    `result`, and the model's reply holds the result alone. An empty `hidden` stores no key.
  - `bun test modules/connectors/src/build-search-tool.test.ts`: the call's record holds `costUSD`
    under `hidden`, and none under `result`.
  - `bun run check:docs` lists no fault for the 3 docs, and
    `grep -c 'shows the whole record' docs/architecture/connectors/search.md` prints 0.
- **Milestone:** 1. No migration and no deploy step. Rollback needs no step. A release before this
  slice passes `hidden` whole through its API and prints it whole in its `log.read`, so after a
  rollback the model reads the cost of the searches that this slice's release recorded. A search's
  cost sits in 2 places across one log: `hidden.costUSD`, and `result.costUSD` in the records of the
  releases before. Code that totals cost reads both. No code totals it.

### web-2. `hidden` on an error, and the cost of a refused search

[The refused search issue](https://linear.app/zgeoff/issue/GEO-2496).

- **Outcome:** The error member of `ToolOutcome` holds the optional `hidden`, the tool runner stores
  `{ message, hidden }` for an error that the tool returns, and the search tool returns its refusal
  after a forget with the cost. The search architecture doc states that every paid search records
  its cost under `hidden`, without the phrase "each search that returns hits".
- **Follows:** "The `hidden` field", "What the tool runner stores" and "The search tool" in the tool
  entry doc, for the error member; `02-types.ts`, section M; `01-usage.ts`, section G.
- **Needs:** web-1. Both may ship in one pull request.
- **Check:**
  - `bun test modules/connectors/src/build-search-tool.test.ts`: a forget lands while the provider
    answers; the search is refused and its result record holds `costUSD` under `hidden`.
  - `bun test modules/tools/src/run-tool-call.test.ts`: an error outcome with `hidden` stores
    `{ message, hidden }`, and the model's reply holds the message alone.
  - `bun test modules/memory/src/read-log-page.test.ts`: the refused search's entry holds no cost.
  - `grep -c 'each search that returns hits' docs/architecture/connectors/search.md` prints 0.
  - By hand in the web client: an error with `hidden` reads well.
- **Milestone:** 1. No migration, no deploy step and no rollback step.

### web-3. Short IDs in the records of 7 tools, and the swap in `log.read`

[The short ID issue](https://linear.app/zgeoff/issue/GEO-2528).

- **Outcome:** `moment.find`, `moment.read`, `moment.keep`, `moment.edit`, `moment.retire`,
  `moment.link` and `memory.recall` record short IDs and return their UUIDs under `hidden.uuids`.
  `log.read` swaps a stored UUID for the short ID of its row. Each reader that (open: stored uuid
  readers) finds reads `hidden.uuids`.
- **Follows:** "The rule for a record" and "A stored record that holds a UUID" in the short ID doc;
  `02-types.ts`, section N; `03-flow.ts`, section I; `01-usage.ts`, section I.
- **Needs:** web-1. Both may ship in one pull request. (open: stored uuid readers) runs first. The
  swap follows option (a) of (open: stored uuid rule), which is not settled. memory-index-1 and
  moments-2 change `memory.recall` and `moment.read` in the same files: the second to land rebases
  on the first.
- **Check:**
  - `bun test modules/memory/src/build-moment-tools.test.ts` and
    `bun test modules/memory/src/build-memory-tools.test.ts`: for each of the 7 tools, the stored
    `result` matches no UUID pattern and holds the short ID, and `hidden` holds the UUID.
  - `bun test modules/memory/src/read-log-page.test.ts`: an entry of each of the 7 tools holds the
    short ID and matches no UUID pattern, for a record with `hidden` and for a record with a UUID in
    `result`; an entry of `memory.diff` with a UUID in `result` does the same; an entry whose moment
    is destroyed holds no `momentID`. The test writes each stored record itself, so it needs no
    `memory.diff` tool. The `memory.diff` case rests on (open: change rows) and is not a gate.
  - Acceptance: a tool entry that the release before wrote renders with the short ID or with the key
    omitted, and your views of the log show the whole record.
- **Milestone:** 1. No migration, no deploy step and no rollback step. A release before this slice
  prints `hidden.uuids` as it prints any field, so after a rollback the model reads those UUIDs.

### web-4. The short ID of a proposal in `memory.pending`

[The short ID issue](https://linear.app/zgeoff/issue/GEO-2528).

- **Outcome:** The result and the record of `memory.pending` show a short ID as `proposalID`, and
  the UUID sits under `hidden.uuids`.
- **Follows:** "`memory.pending`" in the short ID doc; `01-usage.ts`, section I.
- **Needs:** web-3. Your choice in (open: proposal short id). The slice adds a migration only under
  the option that adds a column.
- **Check:** `bun test modules/memory/src/build-memory-tools.test.ts`: the result that the model
  gets and the stored `result` of `memory.pending` match no UUID pattern, and `hidden` holds the
  UUID. `bun test modules/memory/src/read-log-page.test.ts`: an entry of `memory.pending` matches no
  UUID pattern.
- **Milestone:** 1.
