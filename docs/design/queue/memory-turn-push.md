# What memory a turn brings

On each turn, nixie can put up to 3 memory items in the turn's blocks without a tool call from the
agent. This doc covers the one method through which the sessions module asks the memory module for
those items, and trigger push, the one way the memory module picks them. Trigger push exists because
the agent sees [the memory index](memory-index.md) only when a session opens. An item whose trigger
phrase matches your message reaches the turn even when the agent does not think to read it.
[Decision 0052](../../decisions/0052-the-lean-memory-index.md) records the choices.

"Built" states what the code does. Every section after it states the design, which is not built. The
sketches in `sketches/memory-index/` hold the shapes, and this doc holds the rules. The
[glossary](../../glossary.md) defines memory item, self-note, retire and forget.
[The labels of a memory item](memory-labels.md) defines trigger phrase, and
[the revision](memory-revision.md) defines text version. Open items are in
[the open list](open/memory-index.md), each marked here as `(open: <name>)`. The work is in
[the slices](slices/memory-index.md).

Terms of this doc:

- **push:** a method that picks memory items for a turn without a tool call. The design has one.
- **ask:** the argument of `readTurnMemory`, and the call itself.
- **trigger push:** the push that matches the turn's message against trigger phrases.
- **pick:** one item that a push picked for a turn.
- **place:** load a pick's text and put it in a block of the turn.
- **recall record:** a record of the kind `memory.recalled`. It lists the item versions whose text
  nixie gave the model, with their scores, and has no text itself.
- **held:** a session holds a text version of an item once a recall record lists that version and
  the turn of that record ended.
- **floor:** the lowest score at which a match counts.
- **encoder:** the embedding model that the store's vector search uses. A deployment can run without
  one.

## Built

- The sessions module builds one similarity search from the turn's text and the 5 `retrieval_*`
  config keys, in `readTurnRetrieval` and `readTurnContext`. It sends the search to memory through
  `recall` and `recallMessages` on `ConversationMemory`, the interface it owns.
- `readRecall` appends a recall record for every search of a turn, a search that finds nothing
  included.
- `readTurnRetrieval` and `readTurnContext` catch nothing. When a search or a read of the log
  rejects, the turn's ask for memory rejects.
- `retrieval_self_notes` is a separate cap for self-notes.
- The agent rates what a turn placed with the tool `memory.rate`. The tool rates the items of the
  thread's newest recall record (`readLatestRecall`) and writes `memory.rated` records. The API
  procedure `memory/readRatingNotes` reads the rating notes, and the web client's step view shows
  them.
- The check of a task start treats `memory.rate` as a memory write tool, as
  [the memory write tools on a task](memory-task-tools.md) describes.

## The port

Shape: [the port and its ask](sketches/memory-index/02-types.ts), section L. Usage:
[one ask per turn](sketches/memory-index/01-usage.ts), section G.

- The sessions module asks the memory module once per turn, through `readTurnMemory` on
  `ConversationMemory`. `readTurnMemory` is the only method of the interface that brings memory to a
  turn. The memory module decides which pushes to use.
- The ask has the turn's text, the thread, the words to leave out of the match (`excludedWords`),
  and `held`, 2 functions that read what the session holds. It has no cap, no floor and no push
  name.
- The 2 functions of `held` are lazy. When every push is off, or the turn has no text, nixie reads
  nothing from the log.
- `readTurnMemory` returns `placed` with the items, the self-notes and the messages, or `none`.
- For a session whose start gives it no memory, such as a task with `memory: none`, the sessions
  module returns `none` itself and asks nothing.
- The memory store implements `readTurnMemory`. The composition root in `apps/server` passes the
  whole memory config to the store, and gives the store to the conversation's runner and the task
  runner.
- The store reaches no outside system, so `adapters/` has nothing for this port.
  [The rules for any port](port-rules.md) apply.
- `ConversationMemorySettings` has 3 fields: `rebuildTokens`, `ownerName` and `agentNames`. The
  sessions module has no setting that tunes a push.
- `held.readMessages` and the `messages` of a `placed` result exist, and no push uses them. The
  `messages` list is always empty. (open: messages on the port)
- The stub in the sessions module's test utils implements `readTurnMemory`. The tests of caps and
  floors are in the memory module.
- When a search or a read of the log rejects, `readTurnMemory` rejects. The port adds no catch.
  (open: rejected ask)

## The selection

Shape: [the selection types and functions](sketches/memory-index/02-types.ts), section M. Flow:
[select, then place](sketches/memory-index/03-flow.ts), section H.

`readTurnMemory` works in 2 stages: `selectTurnMemory` picks, then `placeTurnMemory` places. Each
function of the selection is the one export of its file. `selectTurnMemory` appends nothing. It
returns `selected` with the picks, or `none`. Its steps, in order:

1. `pickTurnPushes` returns the pushes that are on. Trigger push is on when `trigger_items` is
   above 0. With no push on, `selectTurnMemory` returns `none`, before any read.
2. With blank text, it returns `none`, before any read.
3. It reads the state of each item and the versions the session holds. `buildPushExclusions` then
   lists the items that no push may pick: a lapsed item, a pinned item, and an item whose current
   text version the session holds. Only `buildPushExclusions` decides which items those are.
4. It calls each push in order. A push gets that list, plus every pick so far, as `excludedIDs`. A
   push applies only its own cap and floor.
5. With one pick or more, it returns `selected`. Otherwise it returns `none`.

- `pickTurnPushes` returns a list. The list is empty, or has trigger push alone.
- The state of an item has 3 flags: pinned, self-note and lapsed. A lapsed item is one whose end
  time passed. The selection reads no other flag of an item.
- When no match is at or over the floor, or every such item is pinned or held, `selectTurnMemory`
  returns `none`.

## The placing

`placeTurnMemory` works under the delivery lock, the lock that the store takes for every write of a
recall record:

1. It loads the picks in their order.
2. It drops a pick whose item was pinned, retired or forgotten after the selection. It does not pick
   another item in its place.
3. It appends one recall record with the picks' references, their scores and the search mode. nixie
   writes no text, no trigger phrase and no push name to the record.
4. It returns the items for the `retrieved-memory` block and the self-notes for the
   `retrieved-self-notes` block. Trigger push adds no block type.

- When every pick is dropped, `placeTurnMemory` returns `none` and nixie appends nothing.
- A recall record means "the model read these texts", and the sessions module reads it to work out
  what a session holds. So a turn that places nothing has no recall record.
- When a turn places nothing, nixie records no reason for it.
- Trigger push adds no record kind, no field on `model.turn_ended` and no field on
  `memory.recalled`. The members `retrieved` and `retrievedMessages` of the turn-ended record have
  the shape of the built code. So after a rollback, a release from before trigger push parses every
  record.

## The trigger match

- The memory module matches the message against every trigger phrase, with the keyword search and
  the vector search that the store uses for item text. An item's score is the score of its best
  trigger phrase.
- `TriggerIndex` is a search structure over trigger phrases. It exists only in RAM, because nixie
  stores trigger phrases only encrypted under each item's key. The store rebuilds it at each start,
  as it rebuilds its in-memory item index.
- The selection calls one method of `TriggerIndex`, `readMatches`, which returns one match per item.
  (open: trigger match shape)
- nixie picks an item only when its score is at or over `trigger_min_score`.
- Trigger push places at most `trigger_items` items on a turn.
- Self-notes count toward `trigger_items` with other items. They have no cap of their own.
- Trigger push never picks an item with no trigger phrase.
- When the deployment has no encoder, the match is by keyword only, and the recall record has the
  keyword search mode.

## The config keys

Shape: [the keys](sketches/memory-index/02-types.ts), section N.

- `memory.trigger_items` is the most items trigger push places on a turn. Its default is 3, and 0
  turns trigger push off.
- `memory.trigger_min_score` is the floor of a trigger match. The design sets no default number yet:
  the default is a high floor that the builder picks. (open: trigger floor)
- A score depends on the encoder, so a floor measured with one encoder is wrong for another.
- These 2 keys are the only config keys for what a turn brings. The memory config schema is strict,
  so nixie refuses to start on a config file with a key the schema lacks, such as a `retrieval_*`
  key.

## What the designed system does not have

- nixie searches neither item text nor past messages for a turn. Trigger push is the only push, and
  `ConversationMemory` has no `recall` and no `recallMessages` method.
- Past messages reach the agent only through `log.read`.
- The agent has no `memory.rate` tool, in the conversation or in a task. With the index, the agent
  recalls the items it wants, so the design has no rating of pushed items.
- The API has no procedure for rating notes, and the web client has no view of them.
- A log from a release with `memory.rate` can have `memory.rated` records. nixie starts on such a
  log and skips them.

## Not in scope

- A recorded reason for a turn that placed no memory. The product has no reader for one.
- A way to run the selection outside a turn.
- A model that judges the picks before nixie places them. It would sit between `selectTurnMemory`
  and `placeTurnMemory`, where nixie has appended nothing, and a veto of every pick would return
  `none`.
- 4 other shapes for the port: a parameter that chooses the pushes, caps and floors in the ask, a
  registry of pushes, and a separate port with a provider per push.
- A cap of its own for self-notes.
- A way to rate a memory that the turn needed and did not get.
- A measurement of trigger push before release, offline or live.
