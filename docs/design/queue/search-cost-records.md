# What a tool entry of `log.read` shows, and the cost of a search

The model reads past tool results through the `log.read` tool. On the main branch, `log.read` prints
every stored field of a tool result, and for a search those fields hold the cost in dollars. A cost
that the model reads could steer what it searches for. This doc holds the fix: a tool can return a
`hidden` object, which the server records and the model never reads, and `log.read` prints only what
the call showed the model. It also holds the 2 outcomes of the search tool that record a cost under
`hidden`.

This doc holds the rules. The files in `sketches/web/` hold the TypeScript shapes, and a "Shape",
"Flow" or "Usage" line points at the section of one. The [glossary](../../glossary.md) holds the
terms that this doc does not define, such as forget. Every rule of this doc is settled.
[Short IDs in tool records](short-ids.md) holds the second use of `hidden`.

This doc uses 3 names with care:

- **The result record** is the `tool_result` record that the tool runner writes to the event log.
- **The tool's `record`** is an optional object that a tool returns beside its result.
- **A tool entry** is what `log.read` prints for one result record.

## Built

The code on the main branch does this. Every section after this one is design.

- `ToolOutcome` in the tools module has an ok member, built on `DirectResult`, and an error member
  with a `message`. The ok member holds the `result`, which the model gets, and the optional
  `record`.
- The tool runner, `runToolCall`, writes the result record. A result record has a plain payload,
  which a forget never erases, and [erasable fields](../../architecture/core/erasable-fields.md),
  which a forget erases.
- For an ok outcome, the erasable fields hold one key, named `result`. Its value is the tool's
  `record` when the tool returned one, and the result that the model got otherwise. So when a tool
  returns a `record`, nixie stores the result that the model got nowhere.
- For every other outcome, the erasable fields hold one key, `message`. The other outcomes are an
  error that the tool returns, and the outcomes that the tool runner makes itself, such as a call
  with an invalid input.
- A tool's definition declares each key of its result with a trust label, such as `untrusted`. The
  payload holds that declaration as `sources`.
- The search tool and tools of the memory and skills modules return a `record`. The memory tools
  return IDs in place of text on purpose, so that a forget of a memory item leaves no readable copy
  of its text in a result record.
- The search tool returns `result: { hits }` to the model and a `record` that holds the hits and
  `costUSD`. Its declared sources hold `hits` alone.
- After the provider answers, the search tool reads whether a forget ended the session meanwhile.
  When one did, the tool returns an error outcome with a message.
- A failed provider reply carries no cost.
- `log.read`, through `readLogPage` of the memory module, lists result records and prints every
  erasable field of each, as JSON.
- 4 tools return a `record` with keys that their results and their declared sources lack, such as
  `eventIDs`. The 4 are `log.read`, `moment.read`, `moment.keep` and `moment.link`.
- The API passes a result record's erasable fields to the web client in full, and the web client
  prints them as JSON. 2 places of the web client parse them, the step summary and the collector of
  sent messages. Both read `result` alone and accept other keys.
- A tool definition holds `execution`, which is `direct` or `queued`. A `queued` tool runs on the
  action queue of the glossary. Its outcome type, `ActionOutcome`, holds a result and no `record`.

## The `hidden` field

Both members of `ToolOutcome` hold an optional object, `hidden`: the ok member, through
`DirectResult`, and the error member. Shape: [the tool outcome](sketches/web/02-types.ts), section
M. Usage: [a tool that holds a value back](sketches/web/01-usage.ts), section G.

- The model never reads `hidden`: in the tool's reply, or through `log.read`.
- The tool's `record` has one meaning: the stored form of the result. `log.read` prints it to the
  model.
- The field for values that the model never reads has the name `hidden` on both members.
- Only the tool can mark a value as one that the model never reads, and it does so by putting the
  value in `hidden`. nixie cannot derive the mark from the tool's `record`, its result or its
  declared sources.
- A tool never puts text in `hidden` that a forget of another record must erase. A tool's `record`
  has the same rule.
- `ActionOutcome` holds no `hidden`.

## What the tool runner stores

Flow: [the stored fields](sketches/web/03-flow.ts), section H.

- For an ok outcome, the erasable fields of the result record hold `result`, as on the main branch,
  and `hidden` when the tool set it.
- For an error that the tool returns, the erasable fields hold `message`, and `hidden` when the tool
  set it.
- For every other outcome, the erasable fields hold `message` alone.
- When a tool sets `hidden` to an empty object, the tool runner stores no `hidden` key.
- The tool runner sends the model the result alone, or the message alone.
- The result record's payload is the same as on the main branch. The design adds no record kind, no
  migration and no config key.
- `hidden` is one of the erasable fields, so a forget that erases the result record's fields erases
  `hidden` too.

## The search tool

Usage: [the 2 search outcomes](sketches/web/01-usage.ts), section G.

- A search that the provider answers returns `result: { hits }` and `hidden: { costUSD }`, with hits
  or with none. It returns no `record`.
- A paid search is a search that the provider answered, so it has a cost. A paid search can finish
  at the provider after a forget ended its session. The search tool then returns an error, with the
  same message as on the main branch, and returns the cost under `hidden` on the error. This doc
  calls that search a refused search.
- The search tool returns the cost of every paid search under `hidden`, a refused search included.
- The model never reads a search's cost: in the result, in the error, or through `log.read`.
- The input and the result of the search tool are the same as on the main branch.

## What `log.read` prints

Flow: [a tool entry's text](sketches/web/03-flow.ts), section I. Usage:
[the printed entries](sketches/web/01-usage.ts), section H.

- `log.read` prints 2 keys of a result record's erasable fields, `result` and `message`, as JSON
  text. It omits every other key, so it never prints `hidden`.
- A log can hold a search's result record with `costUSD` inside `result`, because the search tool of
  the main branch stores it there. For any result record, `log.read` drops a `costUSD` key of
  `result` when the payload's `sources` do not hold `costUSD`. `log.read` reads no tool name for
  this. The search declares `hits` alone, so such a record prints without its cost.
- When the payload does not decode, `log.read` counts it as holding no source, and drops `costUSD`.
- When the erasable fields hold no `hidden` key and the stored `result` holds no `costUSD` key,
  `log.read` prints the same bytes as on the main branch. The result records of the tools `log.read`
  and `skill_pending` are 2 examples.
- A word search in `log.read` matches the printed text, so it never matches a hidden value.
- A refused search's entry holds the message alone.

## `hidden` in the web client

- The API and the web client pass and print `hidden` as they pass and print every erasable field.
  The web client shows you a call's `hidden` under its result or under its message, the cost
  included.
- For an error that has `hidden`, the web client prints one JSON object with `message` before
  `hidden`.

## Not in scope

- The daily call cap of the search, the paid-tool budget, and any separate store for cost.
- A refund of the daily call cap for a refused search.
- The cost in the result record's plain payload. A forget never erases a payload.
- Storing the model's result beside the tool's `record`. A memory tool's result would sit readable
  after a forget.
- A filter in `log.read` by a list of keys that each tool gives. `log.read` has no such list for a
  tool that the server did not register, such as the search when no search provider is configured,
  so it would print the cost.
- A filter in `log.read` by the keys that `sources` hold. It would hide `eventIDs`.
- A search that fails at the provider, whose reply carries no cost.
- An ok result with no hits in place of the refusal after a forget.
- The UUIDs in a memory tool's `record`: [short IDs in tool records](short-ids.md).
