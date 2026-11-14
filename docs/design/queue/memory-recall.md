# The result of `memory.recall`

- **Status:** draft
- **Work items:** [recall by subject and the page cap](https://linear.app/zgeoff/issue/GEO-2523)
  builds the subjects, `searched`, `leftOut` and the cap.
  [The labels and the revision](https://linear.app/zgeoff/issue/GEO-2549) adds the 3 labels to each
  item. [The memory index block](https://linear.app/zgeoff/issue/GEO-2364) adds the calls with
  `topic` and `topics`.

`memory.recall` gets 2 more kinds of call, a filter by subject, and a result that always fits the
tool-output limit. nixie writes a recall record that says "the model read these texts", and the
Agent SDK's command-line program in the guest cuts a result that is too long at a place the host
cannot learn. So the store cuts the result itself, to a page limit in bytes, before it writes the
record, and the record lists exactly what the result holds.

Terms of this doc, beside the [glossary](../../glossary.md):

- **plain list:** a call with none of `query`, `itemIDs`, `topic` and `topics`.
- **entry:** one item, one index line or one topic count in a result.
- **page limit:** the most UTF-8 bytes of a whole result. The input `limit` is a count of items.
- **recall record:** a `memory.recalled` record. It lists item versions and scores, and no text.

## Shape

```mermaid
flowchart LR
  call[memory.recall] -->|topic, topics| entries[in-memory label entries]
  entries -->|cut to the page limit| result
  call -->|query, itemIDs, plain list| store[readRecall]
  store -->|filters| cap[cap under the delivery lock]
  cap -->|kept versions| record[memory.recalled]
  cap -->|kept items, omitted IDs| result[result with searched, next, leftOut]
```

## Contracts

```ts
memory.recall({ subjects: ['self'], limit: 100 });
// → { items: [{ itemID: 'k3v9x2ab1c', subject: 'self', version: 3, gist: 'I like short replies', … }],
//     next: '418', searched: { subjects: ['self'] }, leftOut: { count: 62, itemIDs: [], versions: 0 } }

memory.recall({ itemIDs: [/* 30 short IDs */] });
// → { items: [/* the first 20 */], next: null, searched: { itemIDs: [/* the 30 */] },
//     leftOut: { count: 10, itemIDs: [/* the other 10, in the order named */], versions: 0 } }

memory.recall({ topic: 'home' });
// → { lines: [{ itemID: 'c2hd81mmqa', gist: 'piano tuned each March by the same tuner', subject: 'owner' }],
//     next: null, searched: { topic: 'home' } }

memory.recall({ topics: true });
// → { topics: [{ topic: 'home', subject: 'owner', items: 3 }], next: null, searched: { topics: true } }

memory.recall({ topic: 'garden' });
// → { lines: [], next: null, searched: { topic: 'garden' } } — no recall record
```

```ts
// memory module: the tool's input and output. The output schema refuses any other key.
type Subject = 'owner' | 'self' | 'shared';

interface RecallInput {
  // …existing fields: query, itemIDs, includeRetired, includeHistory, after, limit
  topic?: string; // 1 to 40 characters; the match ignores case
  topics?: true;
  subjects?: Subject[]; // 1 to 3 distinct values; goes with every kind of call
}

type RecallOutput = RecallPage &
  ({ items: RecalledItemWithLabels[] } | { lines: IndexLine[] } | { topics: TopicCount[] });

interface RecallPage {
  next: string | null; // a decimal cursor; always null for query and itemIDs
  searched: Searched;
  leftOut?: LeftOut; // present only when the result omits an entry or a version
}

interface RecalledItemWithLabels {
  // …existing fields of a recalled item, with `version` now the revision
  gist: string;
  topic: string;
  triggers: string[];
  // with includeHistory, each text history entry holds `textVersion`, and
  labelHistory?: { revision: number; gist: string; topic: string; triggers: string[] }[];
}

interface IndexLine {
  itemID: string; // a short ID
  gist: string;
  subject: Subject;
}

interface TopicCount {
  topic: string;
  subject: Subject;
  items: number;
}

interface Searched {
  // at most one of these 4, copied from the call; none for the plain list
  query?: string; // the first 200 characters
  itemIDs?: string[];
  topic?: string;
  topics?: true;
  subjects?: Subject[]; // when the call passed it
}

interface LeftOut {
  count: number; // the entries the result omits
  itemIDs: string[]; // the omitted items' short IDs in order, for query and itemIDs; [] otherwise
  versions: number; // history versions of an oversized first item that the result omits; else 0
}
```

```ts
// libs/wire, beside toolOutputLimitTokens. A constant, never a config key.
export const recallPageLimitBytes = toolOutputLimitTokens * 2 - 4_000; // 20,000 at 12,000 tokens

// memory module: 2 members the tool adds to the built RecallRequest
interface RecallRequest {
  // …existing fields
  byteBudget?: number; // the page limit less the largest `searched`, `next` and `leftOut` (see The cap)
  measureItem?: (item: RecalledItem) => Promise<number>; // the item's UTF-8 bytes as the tool returns it
}
```

## Constraints

### The calls

- A call passes at most one of `query`, `itemIDs`, `topic` and `topics`. The tool refuses `after`
  with `query` or `itemIDs`, and refuses `includeRetired`, `includeHistory` and `limit` with `topic`
  or `topics`. The tool refuses in its code, as an error result, and a refused call writes no recall
  record.
- These rules cover the conversation's `memory.recall`, built by `buildRecallTool`. The note-taker's
  and the consolidator's own recall tools stay as built until their deletes.
- `limit` stays 1 to 100, 20 by default, and bounds the items of `query`, `itemIDs` and a page of
  the plain list. `itemIDs` takes the first `limit` named IDs, as built.
- A topic page holds at most `index_topic_page` lines, a key of
  [the memory index](memory-index.md#contracts). A topic page and a topic list cover the active
  items that are not pinned.
- `next` is the cursor of the following page for the plain list, `topic` and `topics`, and `null` at
  the end. For a topic page and a topic list, it is the decimal offset of the first entry the page
  omits, so the built `after` pattern `^[0-9]+$` holds.
- A call with `topic` or `topics` writes no recall record. A store recall that finds nothing writes
  none either, from the tool or any other caller.
- A call that finds nothing returns the empty list of its kind with `searched`, and the result says
  the search found nothing.

### `leftOut`

- For `itemIDs`, the omitted items are the IDs past `limit` and the items the cap cut, as one run in
  the order named.
- For `query`, the omitted items are the matches the cap cut, in rank order. A match below the first
  `limit` is not in `leftOut`.
- For the plain list, `leftOut.count` is the items of this page that the cap cut.
- For the plain list, `topic` and `topics`, `leftOut.itemIDs` is `[]`, and `next` starts at the
  first omitted entry. For `topic` and `topics`, `leftOut.count` is every entry after the page,
  whether `index_topic_page` or the page limit ended it.
- A topic page lists every subject's lines of that topic, in the order of the block: subject, then
  newest first.
- `leftOut` never lists an ID the store does not return for another reason: an unknown ID, a
  forgotten item, a retired item without `includeRetired`, or an item outside `subjects`.
- The stored `tool_result` of a recall adds `leftOut`, and `lines` for a topic page, and holds IDs
  by [the rule for short IDs in tool records](../../architecture/core/database.md#short-ids). It
  holds no `searched`, so the query text stays out of the record as built. Its moment IDs are the
  links the result kept.

### The cap

- The page limit bounds `JSON.stringify` of the whole result in UTF-8 bytes. It follows any change
  of `toolOutputLimitTokens`, and covers every caller of the tool.
- For `query`, `itemIDs` and the plain list, the store cuts under the delivery lock, after its
  filters and before the record. It keeps each item while the measured bytes, with 1 byte a comma,
  fit `byteBudget`, and stops at the first that does not fit. It always keeps the first item.
- The tool works out `byteBudget` from the call: `leftOut.itemIDs` at its largest names every ID the
  call names for `itemIDs`, `limit` IDs for `query`, and none for the plain list, with `count` and
  `versions` at 6 digits each.
- `measureItem` counts every field of the item, its history and its moment links included, so no
  long field can push a result past the limit.
- A request with no `byteBudget` is cut by nothing. The built callers of the store's recall pass
  none.
- When `measureItem` rejects, the recall rejects before the record.
- For a topic page and a topic list, the tool cuts the entries to the page limit.
- When the first item alone passes the budget, the store keeps its current version and the newest
  history versions that fit, and the tool drops the item's moment links from the end until the
  result fits, with no count of the dropped links. The record names versions and no moment link, so
  the drop after the record leaves it true. `leftOut.versions` counts the omitted versions.
- A current version alone holds at most 2,000 characters of text and 2,000 of quote. When it alone
  passes the budget, the store returns and records it whole: the command-line program then cuts at
  48,000 characters, which the item never reaches.

### The record

- `memory.recalled` lists exactly the item versions the result holds.
- When the process dies after the record and before the reply reaches the model, the session does
  not hold those items, because the turn of that recall never ended. A turn that is interrupted and
  still ends is the open question below.
- When `memory.retire` targets an item a recall omitted, the built `runIntentGate` finds no record
  of it.

## Decisions

- **The page limit is 2 bytes a token, less 4,000 bytes.** The command-line program counts tokens,
  and text outside English or full of links comes to under 3 bytes a token. The web fetch tool
  allows 2 bytes a token for the same limit.
- **The store cuts, before the record.** A cut in the tool would come after the record and need a
  second record that takes items back.
- **When the interrupted-turn reproducer shows items counted that the model never got, a recall
  counts as held only when its tool result comes before the boundary the interrupted turn commits.**
  An agent's call on 13 Nov, which the owner accepted: it keeps the items the model did read and
  drops only the ones it missed.

## Builder decides

- The wording of each refusal, and how and in what words the result says a search found nothing.
- The trust label of `searched` and `leftOut` in the tool's result declaration.
- The names of `byteBudget` and `measureItem`, which stay inside the memory module.
- Test layout.

## Out of scope

- A way to read the versions that `leftOut.versions` counts.
- A higher tool-output limit, and a page limit per model harness. Whether the limit fits the Codex
  harness is the harnesses design's check.
- A record of a topic page or a topic list.

## Open questions

- **Does the command-line program pass a result of the page limit whole?** A measurement settles it,
  with a case of many small items beside the filler, in case the program re-serializes the result:
  the probe cases in [recall by subject and the page cap](https://linear.app/zgeoff/issue/GEO-2523),
  and a by-hand run of the model API lane that reads the model's bytes per token on invented items
  in the recall shape. Until then, the page limit is the formula above. If a case is cut, the item
  lowers the limit to the largest size the probe passes whole, and its pull request says so.
- **Does an interrupted turn count a recall's items as held?** A reproducer settles it: an e2e test
  holds a recall at the fault point `memory.recall.checked`, interrupts the turn, releases the
  point, and reads the session's deliveries. The built replay counts every recall record up to the
  turn's `recalledThrough`, the log head the sessions module reads when the guest reports the turn's
  end, so a record appended before that report counts even when the model never got its result.
  Until the reproducer runs, the turn end marks the recall's items as held, as built. The decision
  on an interrupted turn sets what changes when it fails.
