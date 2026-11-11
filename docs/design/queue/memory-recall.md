# `memory.recall`

`memory.recall` is the one tool that reads memory items. This doc covers its 5 kinds of call, its
result, and the size cap on a result. The cap exists because of the recall record. nixie writes that
record for each recall that returns items, and 2 pieces of code read it as "the model read this
item's text". The program that runs the model cuts a tool result that is too long. A cut result
would make the record false, so nixie cuts the result itself, before the record, to a size that
program passes whole.

"Built" states what the code does. Every section after it states the design, which is not built. The
sketches in `sketches/memory-index/` hold the shapes and the exact texts, and this doc holds the
rules. Terms are in the [glossary](../../glossary.md). [The labels](memory-labels.md) define gist,
topic and trigger phrase. [The revision](memory-revision.md) defines the revision and the text
version of an item. [The memory index](memory-index.md) defines an index line and the config key
`index_topic_page`. Open items are in [the open list](open/memory-index.md), each marked here as
`(open: <name>)`. The work is in [the slices](slices/memory-index.md).

Terms of this doc:

- **plain list:** a call with none of `query`, `itemIDs`, `topic` and `topics`. It lists every
  active item, a page at a time.
- **topic page:** the result of a call with `topic`: the index lines of one topic.
- **topic list:** the result of a call with `topics`: each pair of a topic and a subject, with its
  item count.
- **entry:** one item, one index line or one topic count in a result.
- **page limit:** the most UTF-8 bytes a whole result has. It is a size in bytes, and not the input
  `limit`, which is a count of items.
- **size cap:** the cut of a result to the page limit.
- **delivery lock:** the store's lock around every write of a recall record.
- **byte budget:** the part of the page limit that the entries may use.
- **recall record:** a record of the kind `memory.recalled`. It lists item versions, with no text.
- **held:** a session holds an item's text once a recall record lists it and the turn of that recall
  ended.

## Built

- `buildRecallTool` builds `memory.recall`. Its input has `query`, `itemIDs`, `after`, `limit`,
  `includeRetired` and `includeHistory`. `limit` allows 1 to 100. Each item in the result has its
  `subject`. The output schema refuses an extra key.
- The store's `RecallRequest` takes `subjects`, and `readRecall` applies it to the plain list, the
  search and named IDs.
- A result is bounded by a count of items alone: 20 by default and 100 at most. For named IDs,
  `readRecall` returns the first `limit` IDs. Only the plain list returns a cursor.
- `readRecall` writes the recall record under the delivery lock, before it returns to the tool. It
  writes one for every recall, a recall that finds nothing included. The record lists every version
  of an item's history that the result has.
- The tool reads each item's moment links, the moments that cite the item, after the store returns.
- The tool-output limit is `toolOutputLimitTokens`, 12,000 tokens. The Agent SDK's command-line
  program inside the guest cuts a result past the limit, and the host cannot learn where the cut
  fell.
- 2 pieces of code read the recall record. `runIntentGate` checks that a thread recalled an item
  before the agent retires it. The sessions module replays the records to work out which item texts
  a session holds.
- A started task with `memory: read` has the same `memory.recall` tool as the conversation.

## The kinds of call

Usage: [one call of each kind](sketches/memory-index/01-usage.ts), section E. Shape:
[the input](sketches/memory-index/02-types.ts), section H. Flow:
[the tool](sketches/memory-index/03-flow.ts), section F.

A call passes at most one of `query`, `itemIDs`, `topic` and `topics`. The tool refuses a call that
passes 2. (open: error texts)

| Call           | Returns                                                    | Recall record |
| -------------- | ---------------------------------------------------------- | ------------- |
| `query`        | `items`: the matches of a search of item text, best first  | yes           |
| `itemIDs`      | `items`: the named items, in the order named               | yes           |
| plain list     | `items`: a page of every active item                       | yes           |
| `topic`        | `lines`: an index line for each item of the topic          | none          |
| `topics: true` | `topics`: one count for each pair of a topic and a subject | none          |

- A topic page and a topic list cover the active items that are not pinned.
- `itemIDs` takes at most 100 short IDs. `topic` takes 1 to 40 characters, and its match ignores
  case.
- `subjects` takes 1 to 3 distinct values of `owner`, `self` and `shared`, and goes with any of the
  5 calls. nixie then returns only entries of those subjects. A call without `subjects` returns
  every subject. The tool passes `subjects` through to the store's recall request.
- `limit` takes 1 to 100, and is 20 when the call omits it. It bounds the items of a `query`, an
  `itemIDs` call or a page of the plain list.
- A topic page has at most `index_topic_page` lines.
- `after` takes the `next` of the page before. It goes with the plain list, `topic` and `topics`.
  The tool refuses it with `query` or `itemIDs`.
- The tool refuses `includeRetired`, `includeHistory` and `limit` with `topic` or `topics`.
- A refused call writes nothing.

## The result

Shape: [the output](sketches/memory-index/02-types.ts), section H.

- A result has exactly one of `items`, `lines` and `topics`, then `next` and `searched`. It has
  `leftOut` only when it omits an entry. The output schema refuses any other key.
- Each item of `items` has every field that the built tool returns, and its 3 labels: `gist`,
  `topic` and `triggers`. The item's `version` is its revision.
- With `includeHistory`, an item has 2 histories. Each entry of the text history has its text
  version in `textVersion`. Each entry of the label history is one label set with its `revision`.
- Every result has `searched`, which repeats the input of the call: the query, the IDs, the topic or
  `topics: true`, and `subjects` when the call passed it. For a plain list without `subjects`,
  `searched` is an empty object.
- `searched` repeats at most the first 200 characters of a query. The fields beside the entries then
  have a known largest size, which the byte budget needs.
- `next` is the cursor of the following page for the plain list, `topic` and `topics`, and `null` at
  the end. It is always `null` for `query` and `itemIDs`.
- A call that finds nothing returns the empty list of its kind with `searched`. The text part of the
  tool result reports that the search found nothing. (open: empty recall text)
- nixie writes no recall record for a call that finds nothing, the plain list included. The built
  code writes one, and the design changes that.
- [Short IDs in tool records](short-ids.md) owns the rule that the `tool_result` record of a recall
  holds short IDs. That rule covers `lines` and `leftOut`.

## `leftOut`

A result has `leftOut` when it omits an entry: for size on any call, or past `limit` on an `itemIDs`
call. It has `leftOut` too when it omits versions of an oversized first item. (open: leftOut for
versions) `leftOut` has 3 members.

- `leftOut.count` is the number of entries the result omits.
- `leftOut.itemIDs` lists the short IDs of the omitted items, for a `query` call and an `itemIDs`
  call. The agent passes them in a second call, and the same rules apply to that call.
- For an `itemIDs` call, the omitted items are the items past `limit` and the items the size cap
  cut. They are one sequence, in the order named: every item the store would return after the last
  one in the result.
- For a `query` call, the omitted items are the matches the size cap cut, in rank order. A match
  below the first `limit` matches is not part of the result and not in `leftOut`.
- For the plain list, `topic` and `topics`, `leftOut.itemIDs` is empty, and `next` starts at the
  first entry omitted.
- `leftOut.versions` is above 0 only when the first item alone is too big, with `includeHistory`. It
  is the count of that item's text versions that the result omits. It is 0 in every other `leftOut`.
  The tool has no input that reads those versions.
- `leftOut` never lists an ID that the store does not return for another reason: an ID the store
  does not have, a forgotten item, a retired item without `includeRetired`, and an item of a subject
  outside `subjects`.

## The page limit

Shape: [the constant](sketches/memory-index/02-types.ts), section I. (open: page limit name)

- The page limit bounds the UTF-8 bytes of the whole result as the model gets it, which is
  `JSON.stringify` of the result. (open: recall probes)
- The page limit is `toolOutputLimitTokens` times 2 bytes, less 4,000 bytes. It is 20,000 bytes at
  12,000 tokens, and it follows a change of that limit.
- The rate is 2 bytes a token. The command-line program counts tokens, and text outside English and
  link-like text come to under 3 bytes a token. The web fetch tool allows 2 for the same limit. The
  4,000 bytes give room for a result that counts a little under 2 bytes a token.
- The command-line program cuts a result down to 48,000 characters, which is 4 characters a token.
  It starts to cut at a smaller size, by its token count. So 48,000 characters is no safe page
  limit.
- The page limit is a constant in `libs/wire` and not a config key. A deployment has no reason to
  tune it.
- One constant covers every caller of the tool, the conversation and a task alike. The recall tool
  does not know which model harness its caller runs on. Whether the constant fits the Codex harness
  is not checked. (open: codex tool output limit)

## Where the size cap runs

Shape: [what the tool gives the store](sketches/memory-index/02-types.ts), section J. Flow:
[the cap](sketches/memory-index/03-flow.ts), section F.

For a call that returns `items`, the store cuts the result, under the delivery lock, after the
filters and before the recall record. A cut in the tool would come after the record, and nixie would
need a second record that takes items back.

- The tool gives the store a byte budget and a measuring function with the recall request. (open:
  recall request names)
- The byte budget is the page limit less the bytes of the result's other fields at their largest:
  `searched`, `next`, and a `leftOut` with every ID the call could return.
- The measuring function returns the UTF-8 bytes of one item as the tool returns it, with its
  history and its moment links. It reads the links, so the store awaits it.
- The measuring function counts every field of the item. So a long provenance line (`about`) or a
  long list of moment links cannot make a result pass the limit. (open: item field sizes)
- The store walks the items in the order it returns them. It adds each item while the sum of the
  measured bytes, with one byte a comma, is within the budget. It stops at the first item that does
  not fit. The returned items are always the first ones of that order, with no gap.
- The store always returns the first item.
- The store writes the recall record for the returned items only. It returns those items, the IDs it
  omitted in order, and for the plain list the cursor of the last returned item.
- When a recall request carries no budget, the store cuts nothing.
- When the measuring function rejects, the recall rejects before the record, and the tool returns
  its error.
- For a topic page and a topic list, the tool cuts the entries to the page limit. No record is
  involved.

## An oversized first item

Flow: [the oversized first item](sketches/memory-index/03-flow.ts), section G.

When the first item with its history and its moment links is over the byte budget, nixie shrinks it
in 2 steps:

1. The store returns the item's current version, and cuts its text history to the newest versions
   that fit.
2. The tool then drops the item's moment links from the end until the result fits.

- The recall record lists only the versions returned, and `leftOut.versions` counts the rest.
- A current version alone has a text and a quote, the words the version came from, of at most 2,000
  characters each. When it alone is over the budget, the store returns it whole and records it.
- That one result can pass the tool-output limit. The command-line program then adds its cut notice
  and cuts to 48,000 characters. The item is shorter than that, so the model gets all of its text.
  (open: recall probes)

## The recall record

- nixie writes `memory.recalled` with exactly the item versions the result has. The record has
  references to the item versions and the match scores of a query, and no text.
- The store writes the record under the delivery lock, before the tool renders. The size cap runs
  before the record, so no crash point lies between the cut and the record.
- When the process dies after the record and before the reply reaches the model, the record lists
  items the model never read. The session does not hold them, because the turn of that recall never
  ended.
- When `memory.retire` targets an item that a recall omitted, `runIntentGate` finds no recall record
  that lists the item. [The write gate](memory-write-gate.md) owns what the gate then does.

## Not in scope

- A way to read the versions that `leftOut.versions` counts.
- A higher tool-output limit, and a page limit for each model harness.
- A fix for a turn that is interrupted, or stops at its call limit, between the recall record and
  the reply. The session may then hold items the model never read. The fix belongs in how the
  sessions module marks a turn end. (open: interrupted recall)
- A record of a topic page or of a topic list.
