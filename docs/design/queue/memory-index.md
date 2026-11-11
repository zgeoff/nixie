# The memory index at a session's opening

The memory index is a block in the first message of a session. It lists every memory item in one
short line, grouped by subject and topic. This doc covers the block, how nixie folds it to fit a
token budget, and the config keys that size it. With the index, the agent sees what memory has, and
reads an item in full with [memory.recall](memory-recall.md) only when the agent wants the item.
[Decision 0052](../../decisions/0052-the-lean-memory-index.md) records the choices.

"Built" states what the code does. Every section after it states the design, which is not built. The
sketches in `sketches/memory-index/` hold the shapes and the exact texts, and this doc holds the
rules. Terms are in the [glossary](../../glossary.md): memory item, subject, self-note, shared item,
forget, task. [The labels of a memory item](memory-labels.md) defines gist, topic and seal. Open
items are in [the open list](open/memory-index.md), each marked here as `(open: <name>)`. The work
is in [the slices](slices/memory-index.md).

Terms of this doc:

- **session:** one context of a model: the conversation's, or a task's. The first message of a
  session is its opening.
- **memory index:** the `memory-index` block. The store's in-memory item index (`MemoryIndex` in the
  code) is another thing: the search structure that the store rebuilds at each start.
- **index line:** one item in the index, as `[shortID] gist`.
- **open topic:** a topic whose index lines the block shows.
- **folded topic:** a topic that the block shows as one line with its item count.
- **pinned core:** the items that you or the agent pinned. The `pinned-memory` block shows each in
  full in every session.
- **active item:** an item that is neither retired nor forgotten.
- **recall record:** a record of the kind `memory.recalled`. nixie writes one when it gives the
  model an item's text.

## Built

- `readSessionOpening` renders the opening blocks `pinned-memory`, `status`, `summary` and
  `recent-turns`, in that order. `renderTurnPreamble` renders the blocks of a turn.
- The sessions module reaches memory through an interface it owns, `ConversationMemory`, with
  `readPinnedCore` and `readPinnedCoreUse` for the pinned core.
- The memory module counts the tokens of the pinned core against `pinned_core_tokens`, which
  defaults to 2,000.
- A status registry builds the lines of the `status` block (`buildDefaultStatus`).
- `memoryConfigSchema` is a strict object, with no key for an index.

## Where the block sits

Usage: [the block and a read of one item](sketches/memory-index/01-usage.ts), section D. Text:
[the block](sketches/memory-index/02-types.ts), section P.

The first message of a conversation session has these blocks in this order. nixie omits a block that
has nothing in it.

| Order | Block           | Has                                                                    |
| ----- | --------------- | ---------------------------------------------------------------------- |
| 1     | `pinned-memory` | the pinned core                                                        |
| 2     | `memory-index`  | one line per active item that is not pinned, by subject and then topic |
| 3     | `status`        | the status registry's lines                                            |
| 4     | `summary`       | the newest readable summary                                            |
| 5     | `recent-turns`  | the turns after that summary                                           |

- The `status` block has 2 lines for the index: the count of index items, and the index's tokens
  against its budget. (open: index status lines)
- The first message of a task that the agent started opens with `status`. When the start of the task
  has `memory: read`, the memory blocks follow in this order: `pinned-memory`, `memory-index`,
  `retrieved-memory`, `retrieved-self-notes`, `retrieved-messages`. The task's other blocks and its
  brief come after them. Every rule of this doc applies to a task's index.
- A task with `memory: none` in its start gets no memory block.
- The design does not change the order of the blocks of a later turn: `pinned-memory-changes`,
  `retrieved-memory`, `retrieved-self-notes`, `retrieved-messages`, then the events block.
- nixie sends the opening blocks to the model of the turn and to no other provider.

## What the block lists

The rules of this section come from the tracker issue of the memory index, which
[the open list](open/memory-index.md) links. (open: index details)

- The block lists every active item that is not pinned. It omits a pinned item, a retired item and a
  forgotten item.
- The block groups items by subject, in this order: `owner`, `shared`, `self`. Inside a subject it
  groups them by topic.
- Each item is one index line, `[shortID] gist`. The agent passes that short ID to `memory.recall`
  in `itemIDs` to read the item.
- The first line of the block gives the agent 3 things: what the index is, that `memory.recall` with
  `itemIDs` reads an item, and that `memory.recall` with `topic` opens a folded topic. (open: index
  opening line)
- When 2 topics differ only by case, they are one topic. The block shows the topic as its newest
  item spells it. So `Home` and `home` are one topic.
- `index_item_order` orders the items of a topic. Its one value is `newest-first`.

## The budget and the folding

Flow: [the render](sketches/memory-index/03-flow.ts), section E. The rules of this section come from
the memory index issue too, and belong to the same open item. (open: index details)

1. The memory module counts the tokens of every line of the block: the first line, the headings, the
   index lines, the folded topic lines and the closing line.
2. When the count is over `index_tokens`, nixie folds one open topic to one line with its name and
   its item count. `index_fold_order` picks the topic. It has 2 values. With `largest-first`, nixie
   folds the open topic with the most items. The design gives no rule for `oldest-first`. (open:
   fold order)
3. Folding repeats until the count is within `index_tokens` or every topic is folded.
4. When every topic is folded and the count is over `index_tokens`, nixie drops topics into one
   closing line, the topic with the fewest items first, until the count is within `index_tokens`.
   The closing line gives the count of dropped topics and of their items, and points at
   `memory.recall` with `topics: true`. Text:
   [the folded line and the closing line](sketches/memory-index/02-types.ts), section P.

- After the folding and the dropping, the index is within `index_tokens`. The design gives no rule
  for a budget smaller than the first line, the headings and the closing line together. (open:
  smallest budget)
- The index budget is separate from `pinned_core_tokens`.
- The agent opens a folded topic with `memory.recall` and `topic`. It lists the dropped topics with
  `memory.recall` and `topics: true`.

## When the index renders

- nixie renders the index once, when the session opens. The block is part of the transcript from
  then on, as the `pinned-memory` block is.
- When a label edit or an item lands in the middle of a session, that session's index is the one it
  opened with. The index of the next session shows the change.
- [Trigger push](memory-turn-push.md) skips an item whose text the session has, and it reads the
  recall records to know which texts those are. nixie writes no recall record for the index. So
  trigger push can place an item's text in a turn although the index showed the item's gist.
- nixie writes no record of what the index showed, for a conversation session or for a task. The
  product has no reader for such a record, and a forget of an item would have to erase the item from
  it.

## Who renders it

Shape: [`SessionIndex` and `readIndex`](sketches/memory-index/02-types.ts), sections K and L.

- The memory module renders the index and counts its tokens.
- The sessions module asks for the index through `readIndex` on `ConversationMemory`, as it asks for
  the pinned core, and places the block.
- `readIndex` returns a `SessionIndex`: the text of the block, and the item count and the token
  counts for the 2 status lines. (open: session index fields)
- The renderer reads the gist and the topic of each item from the store's in-memory item index. It
  decrypts nothing when a session opens.
- [The rules for any port](port-rules.md) apply to `ConversationMemory`.

## The config keys

Shape: [the keys and their defaults](sketches/memory-index/02-types.ts), section N. Usage:
[a config file](sketches/memory-index/01-usage.ts), section F. The defaults come from the memory
index issue too, and belong to the same open item. (open: index details)

- `memory.index_tokens` is the index's token budget. Its default is 3,000, so a deployment that sets
  nothing has the index on.
- When `index_tokens` is 0, the opening has no `memory-index` block.
- `memory.index_fold_order` picks the topic to fold. Its values are `largest-first` and
  `oldest-first`, and its default is `largest-first`.
- `memory.index_item_order` has the one value `newest-first`.
- `memory.index_topic_page` is the most index lines that one `memory.recall` call with `topic`
  returns. Its default is 200.
- The memory config schema is strict, so a release that does not have a key refuses a config file
  that sets it.

## Not in scope

- A note in a later turn for items that land in the middle of a session.
- A record of what the index showed.
- A count of recalls per item, and an item order such as `most-recalled-first` that needs one.
- A filter that hides some items from the index. The designed system has no sensitive flag, as
  [the labels](memory-labels.md#the-sensitive-flag) state.
- A split or a merge of a topic that grew too big. A topic with more than `index_topic_page` items
  takes one more `memory.recall` call for each page past the first.
- A rule that lets a block go to another provider, such as a speech provider.
- A measurement of the index before release, offline or live. The index gets no test of how well it
  serves the agent before you use it.
