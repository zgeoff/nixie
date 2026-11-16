# The memory store

A memory item is one stored fact, such as "the spare key sits under the blue flowerpot", and every
change to its text or state adds a version that nixie never rewrites. Every value of an item, its
text included, is encrypted under keys that belong to that item alone, so a forget deletes those
keys and every version becomes unreadable at once, in the database and in every backup of it, under
[0007](../../decisions/0007-crypto-shredding.md). The model and the client reach memory through one
interface whose verbs are recall, remember, retire, restore, undo, pin, unpin and forget. The
`modules/memory` package holds the store.

[The event log](../core/event-log.md) covers the records memory appends, and
[erasable fields](../core/erasable-fields.md) covers the key store that holds each item's keys.
[Memory writes](./writes.md) covers the checks a model write passes and the proposals it becomes,
and [memory in context](./context.md) covers how memory reaches the conversation.

## Items and versions

Memory lives in [projections](../core/event-log.md#projections): tables that nixie builds from the
records of the event log, and can rebuild from them. The items table holds one row per item: its
current version, its state, whether it is pinned, its [short ID](../core/database.md#short-ids), its
subject, a count of its label edits, and the sequences that created it and last changed it. The
model reads and names an item by its short ID, and the store keys everything else, the item's keys
included, by the item's UUID.

The subject records whose the item is: owner for a fact about the user, shared for something between
the user and nixie, such as a deal, a nickname or a running joke, and self for a
[self-note](./writes.md#self-notes) that nixie writes about itself. A new item, or a new item's
proposal, is owner unless a subject mark commits beside it: a record of its own for shared or self.
Later, only an approved [subject change](./writes.md#subject-changes), or an undo of one, moves the
item, through a subject change record beside the version record that moves it.

The subject travels in records of its own because nixie keeps its log and tables readable by the
release before it, so a rollback by one release works
([migrations](../core/database.md#migrations)). That release skips a record kind it does not know,
and refuses a version or proposal record with a field it does not know. For the same reason the
items row keeps a kind column, `self` or `fact`, and the store reads the subject of a row that holds
none from that kind.

The versions table holds one row per version: what changed, the state that version gave the item,
the sealed text, its [end time](#end-times), and the provenance. A version's provenance is its
origin (the user, the conversation, a task, or a lapse when an end time passed), its source of
content (the user's own words, or [untrusted](../../glossary.md) text), the task and proposal behind
it, the verdicts of the write checks, and the evidence offsets inside the message the quote came
from. nixie sets every provenance field from the turn or the client action that wrote the version,
and a tool's arguments never reach them. The provenance sits in plain columns, so the memory view
and a review of poisoned memory filter on it without decrypting anything.

The text, the evidence quote and the user's request to retire the item sit together in one sealed
value. A version's record carries it in its payload, which a projection reads, and not in its
erasable fields, which a projection never reads
([what a record holds](../core/event-log.md#what-a-record-holds)), so a rebuild from the log gives
the live versions rows. The sealed value is ciphertext under the item's keys, so the log's copy of
each version falls to the same forget as the table's copy.

## Labels and the revision

Each item has labels: a gist of 1 to 80 characters, a topic of 1 to 40 and up to 5 trigger phrases
of 1 to 60, each on one line. The gist sums up the item, the topic groups it, and a trigger phrase
holds words that should bring it up. Recall lists items by their labels, so the model can choose
which items to open. The labels sit sealed under the item's key, in a `memory_labels` table with one
row per labelling, written by a `memory.labelled` record. The store keeps the current labels of
every item in memory, loads them at start, and drops an item's entry when a forget removes its keys.

A label edit adds no version, because the version counts changes to the text and the state. The
item's revision counts both: it is the version plus the items row's count of label edits, and the
store adds the two on read, so the items row holds no revision. A change binds to the revision
([changing an item](#changing-an-item)), so an edit of labels makes a stale read fail like any other
edit. The model's tools, the API and the memory view carry the revision in a field named `version`.
A labelling keeps the revision it made, and a proposal the revision it targets. Version records, the
versions table, the history, a recall record and a proposal's hash keep the version. In this doc,
"version" always means the text version.

An item with no label row shows labels that nixie derives from its text: the gist is the text with
its spacing collapsed and cut to 80 characters, the topic is the subject, and there are no triggers.
At each start the store writes those derived labels for each such item, in a `memory.labelled`
record whose change is `backfilled`. A backfill counts as no label edit, and a second start finds no
item to label. A new item takes the topic's spelling from an existing item when the two differ only
in case.

## States

An item is in one of 4 states:

| State      | Recall returns it                 | Changes it accepts                                  |
| ---------- | --------------------------------- | --------------------------------------------------- |
| active     | Always                            | edit, edit labels, retire, undo, pin, unpin, forget |
| retired    | Only when asked for retired items | edit, edit labels, restore, undo, forget            |
| forgetting | Never                             | none; the forget completes it                       |
| forgotten  | Never                             | none; the keys are gone and nothing reads           |

Retirement ends a fact that stopped being true, and the item stays readable with its history. A
retirement takes the item out of the pinned core, and a restore does not pin it again. Forgetting
destroys an item, and only a checked action in the client forgets one, so a misread "forget that" in
the conversation retires an item and never destroys it.

## Changing an item

Each change except a pin and an unpin binds to the revision its caller read. When the item has moved
past that revision, the change fails as stale and writes nothing, so 2 tasks that edit the same item
never overwrite each other unseen. The change's records and the rows they fold into commit in one
write transaction, behind the writer epoch check that stops an older nixie process from writing
([the single writer](../core/database.md#the-single-writer)).

- **Remember** creates an item with its key and its first version, or adds an edited version that
  keeps the item's state.
- **Retire** and **restore** add a version with the same text and the other state. A retire, a
  restore and an undo keep the source of the text they copy and take only the origin from the actor,
  so a state change never relabels untrusted text as the user's words.
- **Undo** adds a version with the text and state of the version before the current one. An undo
  after a later edit therefore fails as stale instead of discarding that edit. An undo of a first
  version retires the item, because no earlier text exists.
- **Edit labels** adds a `memory.labelled` record and no version, and raises the revision by 1.
- **Pin** and **unpin** change where the item shows and not its text, so each appends a
  `memory.pinned` record and adds no version. A pin that carries the revision its caller read fails
  as stale once the item moved past it. Only an active item can be pinned, whatever its subject. A
  pin, or an edit of a pinned item, fails when it would take
  [the pinned core](./context.md#the-pinned-core) past its budget. An unpin binds to no revision,
  and fails only when the item is not pinned.

## End times

An item can carry an end time, the UTC instant after which its fact stops holding, such as the end
of Sunday for "is in Lisbon this week". The end time sits in a plain column on each version, and the
item's row takes it from the current version. A remember that leaves the end time out of an edit
keeps the current one, and an edit can clear it. The store refuses an end time that has passed.

Recall treats an active item past its end time as retired from that instant, before any version
records it. A recall of active items and the pinned core drop the item, and a recall that asks for
retired items returns it as retired and unpinned. A restore accepts such an item as it accepts a
retired one, and unpins it as a retirement would. The cut-off sits at read time, against the store's
clock, because the indexes change only when a version is written.

The server runs a lapse sweep every hour. It lapses overdue
[proposals](./writes.md#memory-proposals), and retires each active item past its end time with the
lapse origin. The retirement keeps the end time on its version, so the history shows when the fact
was set to end. When an item changed between the sweep's read and its retirement, the sweep leaves
the item to the next sweep. A lapse never forgets an item, so an early end costs the user one
restore. A restore clears the end time, and so does an undo of a lapse, so the next sweep leaves the
item active.

## Keys

Each item key is an AES-256-GCM key in the key store, wrapped by the deployment key as every record
key is. Every version is encrypted with the item ID and the version number as additional data, so a
sealed value copied under another item or another version fails to decrypt. Until a
[purge](#the-evidence-purge) reaches it, an item has one key, whose ID is the item's UUID, random as
every key store ID must be ([key store IDs](../core/database.md#key-store-ids)). That key seals
every value of the item: each version's text and quotes, each proposal and each labelling. A purge
adds keys of 2 kinds:

- A generation key seals each value written while it is in force. The item's UUID is generation 0,
  and each purge closes the generation in force and starts the next under a new key.
- A version key seals one version's text alone. Only a purge creates one, for the current text when
  no version key sealed it.

Every key after generation 0 has an ID of the form `<item UUID>/<random UUID>`, so the memory forget
finds every key of an item in the key store alone, by that prefix and the UUID itself.

### The evidence purge

A purge removes the copies of a forgotten message that a memory item holds. The message is the
evidence of some version, and the item's older versions and pending proposals keep its quote, so the
purge makes those values unreadable and keeps the current text readable. A
`memory.evidence_purge_started` record holds the forgotten record and the items to purge, the purge
set. This build never writes that record, so no purge starts. The
[record forget](../channels/api.md#forgetting-a-record) will write it in its first transaction
([GEO-2605](https://linear.app/zgeoff/issue/GEO-2605)).

From the started record on, every reader reads each older version and pending proposal of those
items as removed. Every proposal write for one of those items fails with `ItemPurgingError` until
its purge finishes. A write that quotes a record whose forget has begun fails with
`QuotedRecordForgettingError`, and an undo of a version that reads removed fails with
`VERSION_REMOVED`, as [memory writes](./writes.md) describes.

The purge of one item commits once, under [the delivery lock](#the-delivery-lock). That commit
lapses the item's pending proposals. When no version key seals the current text, it writes a bridge
version: a copy of that text under a new version key. It closes the generation key in force and
every version key except the current version's, in a `memory.evidence_purge_closed` record that
holds the next generation key, and it seals the current labels again under that key. The bridge and
the new labelling each raise the revision, so a change bound to the revision before the purge fails
as stale. After the commit the purge deletes the closed keys and writes `memory.evidence_purged`.
The memory view's history shows a bridge with its text and "Kept when a message was removed", with
no change or origin. Recall shows its change as `kept`, with the line "kept when a message it quoted
was removed".

A record forget destroys the forgotten record and, for a task's brief, each `task.start` call record
that holds the brief ([started tasks](../core/started-tasks.md#the-start)). It runs the session
cleanup once for each record it destroys, the call records first and the forgotten record last, so
every session has rebuilt before a purge deletes a key. The cleanup for the forgotten record
finishes that record's purge set before the forget writes `record.forgotten`, and a call record owns
no purge set. At start the server reruns each unfinished record forget, and finishes each purge set
that no record forget owns.

### Reading a key

Every reader of an item's value finds its key through one lookup, `readItemKeys`, which takes a
version, a version's quote, a proposal or a labelling, and answers `readable` with the key, or one
of:

- `removed`, when a purge closed the key, or the item is under purge and the value is not current;
- `shredded`, when the key store no longer holds the key;
- `unreadable`, when the key fails to unwrap.

The lookup reads 2 projections: `memory_item_keys` holds each key after generation 0 with the
sequence of the record that closed it, and `memory_evidence_purges` holds each item of a purge set
and how far its purge got. A purge marks each key it closes there before it deletes the key. The
lookup therefore reads those rows, then the keys, then the rows a second time, so a key that a purge
deleted during the key read reads as `removed`, never `shredded`. The lookup picks the generation
key in force when the value's record was written. A writer that seals a new value has no record yet,
so it takes the newest generation key from `readCurrentItemKey`, beside the lookup.

A test beside the lookup fails when a file under `modules/memory/src` outside its list calls the
log's raw key reader, `readRecordKeys`. The list holds 4 files, each with its reason in the test:

- the lookup itself;
- `readCurrentItemKey`, which reads the one key a writer seals with;
- the purge's quote reader in `purge/`, which reads the key of a quoted record, a key that seals no
  item value;
- the held record key reader in `utils/record/`, which reads the keys a cleanup deletes.

## Recall

Recall takes a query, a list of item IDs, or neither, which lists every active item a page at a time
in the order they were created. Each of the three can name `subjects`, and the recall then returns
only the items of those subjects. It returns each item's text exactly as stored, with its ID,
revision, origin, source, date, the quote the gate checked and the model that wrote it, and with its
history it returns every version. A recall never summarizes, so the user can check an answer about
memory against the items themselves, and the quote lets the model check a summary against the words
it came from.

```mermaid
flowchart LR
  Q["query, IDs or a page"] --> R["rank candidate IDs"]
  R --> L["take the delivery lock"]
  L --> C["check state, version and key"]
  C --> D["decrypt the current version"]
  D --> W["record the delivered references"]
  W --> U["release the lock"]
```

The index and the listing rank candidate IDs and never supply the returned text. Under the delivery
lock, recall reads each candidate's current row again, drops any that is not in a state the request
allows, counting an item past its end time as retired, or whose key is gone, decrypts the rest, and
appends a recall record that lists each item and version it delivered. For a query, each item in the
record carries its keyword score and its similarity, each where that index placed it, and the record
says how the query searched, so the client can show what each turn was given and how well it
matched. The record holds references and scores and no text, so a later forget leaves no readable
copy of what a recall delivered.

A query searches both indexes, each above its own floor, and reciprocal rank fusion merges the two
rankings, because a BM25 score and a similarity share no scale. A query can also cap self-notes on
their own: it then ranks them apart, so the user's and the shared items never crowd self-notes out,
and its one recall record lists both. A recall may name the subjects it keeps, and the items of
every other subject leave the ranking before its limit applies. The record's search mode is hybrid,
keyword with no encoder, or keyword fallback while the vector index rebuilds.

### The page limit

The conversation's `memory.recall` returns a page that fits a limit in UTF-8 bytes, because the
Agent SDK's command-line program cuts a longer tool result at a place the host cannot learn. That
program counts the tool-output limit in tokens, and text outside English or full of links comes to
under 3 bytes a token. The limit, `recallPageLimitBytes` in `libs/wire`, therefore allows 2 bytes
for each token of the tool-output limit, and keeps 4,000 bytes back for the rest of the result.

The store cuts the page, and it cuts under the delivery lock, before it appends the recall record.
The tool passes the byte budget, which is the limit less the largest the result can take outside its
items, and a function that measures each item exactly as the tool returns it. The store keeps each
item while the measured bytes, with a byte for each comma, fit the budget, and stops at the first
item that does not fit. It always keeps the first item. A request with no budget cuts nothing. The
record lists exactly the item versions the result holds. A `memory.retire` applies only to a version
that a recall record shows the thread received ([retirement intent](./writes.md#retirement-intent)),
so a retire of an item the page left out goes to the user's review.

When the first item alone passes the budget, the store keeps its current version and the newest past
versions that fit, and the tool drops the item's links to [moments](./moments.md) from the end until
the result fits. A current version that passes the budget on its own comes back and is recorded
whole.

The result's `leftOut` lists what the page left out, so the model can recall those items next, and
`next` starts the plain list at the first omitted item. `searched` echoes the call's query or item
IDs, cut so it always fits the page limit. A recall that finds nothing, from any caller, the turn
search included, returns an empty `items` list and appends no record. The stored tool record holds
`leftOut` by item ID and no `searched`, so the query text stays out of it. A call passes `query` or
`itemIDs`, never both, and passes `after` with neither. The tool refuses any other call before it
reaches the store, so a refused call appends no record.

### Topic pages and the topic list

A call with `topic` returns the gist of every active item that is not pinned and holds that topic or
a topic under it, such as `people` for `people/friends`, ignoring case. A call with `topics` returns
one entry per topic as its items hold it, with its subject and item count. Both read the in-memory
label entries and the item projection under the delivery lock, decrypt nothing and write no recall
record. Entries come in the order of [the memory index](./context.md#the-memory-index): by subject,
then topic, or newest first for the lines of a topic. A call can pass `subjects`, and `after` is the
decimal offset of the first entry to return.

A page holds at most the number of entries that the memory config's `index_topic_page` sets, and
then only the entries that fit the page limit, with the first entry always kept. `next` is the
offset of the first entry left out, or `null`, and `leftOut.count` counts every entry after the
page. A topic with no item returns an empty `lines` list with `searched`. The stored tool record of
a topic page holds the short IDs of its lines, and the UUIDs behind them under `hidden`, a field
that never reaches the model ([short IDs](../core/database.md#short-ids)). The record of a topic
list holds no topic name. The tool refuses a call that passes more than one of `query`, `itemIDs`,
`topic` and `topics`, or passes `includeRetired`, `includeHistory` or `limit` with `topic` or
`topics`.

### The indexes

The keyword index is an FTS5 table with the porter tokenizer in an in-memory SQLite database. It
holds the current text of active items only, and nothing writes it to disk, because a persisted
full-text index keeps forgotten words after their key is gone. FTS5 records a delete as a marker
until its segments merge, so under its default settings a deleted row's words stay in the database
file even after `VACUUM`, and no setting removes them from a backup taken before the forget. Each
start rebuilds the keyword index from the readable active items. After a version's record commits,
still under the delivery lock, the store replaces the item's entry with its current text or drops an
item that left the active state. A query matches any of its words, and the store quotes each word,
so no character a caller sends reads as FTS5 syntax.

The index leaves function words, such as "to" and "a", out of both the query and the text it stores.
BM25 weighs a word by how few items hold it and not by what it means, so a function word that one
item holds would score as high as a topic word and bring back an item the query says nothing about.
The filter covers the stored text too, because the porter tokenizer stems some content words to a
function word, such as "one" to "on". A word in capitals, such as "US", is an acronym and stays.

A query can also set a score floor, which drops each match whose BM25 score falls below it, and can
leave pinned items out. BM25 gives no weight to a word that half the items hold, so in an index of 1
or 2 items every match scores about zero, and a floor above zero drops every match.
[Per-turn retrieval](./context.md#per-turn-retrieval) uses both. A query can also list excluded
words. The index stems them with the same tokenizer as the query, and drops each query word whose
stems all match one of theirs, so "Nixie's" drops with "nixie".

The vector index holds one vector per active item in process memory, and nothing writes it to disk.
A local text encoder, `mdbr-leaf-ir` on its int8 ONNX weights, makes each vector, of which the index
keeps the first 256 numbers at one byte each, and ranks items by their dot product with the query's
vector. The store leaves the excluded words out of the query text it encodes, because a name that
nearly every item holds pulls every item toward the query.

The trigger index is a second pair of indexes in process memory, built as the item indexes are but
with one keyword row and one vector for each trigger phrase of an active item. It ranks an item by
its best phrase. Each start rebuilds it from the newest labels, and each write keeps it current. A
retired item can still hold phrases, so the turn's selection also checks that an item is active
([per-turn retrieval](./context.md#per-turn-retrieval)).

The vector index rebuilds after the store starts, in the background, because encoding every item
takes seconds, and every query searches keywords alone until it ends. After a version's record
commits, the store drops the item's vector and queues its current text for encoding outside the
write transaction, and a retire or a forget drops the vector. The store discards an encoding that
ends after a later change to its item, so a slow encoding never brings back an old text or a
forgotten item. A failed rebuild goes to the server's log and leaves every query on keywords until
the next start.

## The delivery lock

Writes, retire, forget and the last step of every recall share one lock. A forget marks the item
forgetting and drops its index entry while it holds the lock, and a recall checks each item while it
holds the lock. A recall that ranked an item before a forget therefore finds the item gone when it
checks, and a recall that checked first has recorded its delivery before the forget begins, so no
recall delivers the text of an item after its forget started.

## Forgetting

A forget binds to the revision the confirmation showed, so a later edit makes it stale. It runs as a
durable operation in 2 parts:

1. Under the delivery lock, nixie checks the item and its revision, appends a record that marks the
   item forgetting, and drops the item from the index. From here no recall delivers the item.
2. The cleanup deletes the item's keys and checkpoints the key store, drops the index entry again,
   runs the session cleanup for every live session, and appends the record that marks the item
   forgotten.

Every step of the cleanup is safe to run twice. A crash between the 2 parts, or anywhere inside the
cleanup, leaves the item forgetting, and the store's start runs the cleanup for every forgetting
item before it builds the index and before any runner claims work. A deleted key never returns while
a forget waits, and the forget completes only after the session cleanup returns. The server passes
that cleanup in from the conversation, and
[memory in context](./context.md#forgetting-and-the-live-session) covers what it removes.

The key deletion and its checkpoint are the ones [erasable fields](../core/erasable-fields.md)
describes, so neither the key store file nor its write-ahead log keeps the wrapped key. The version
rows and their records stay as ciphertext, and the memory view reads every version of a forgotten
item as a gap with its date and provenance.

### A forget and the key backups

A backup copied before a forget still holds the forgotten item's key, so a forget also reports its
key backup state: off, pending, failed with a reason, or complete. A forget or a bulk forget answers
with this state, and `memory.readForgetStatus` reads it again for the same items.

- The state reads off when the deployment turned the backup schedule off.
- It reads pending until a forget has deleted every item asked about. An item that no forget took,
  or an unknown item ID, keeps it pending.
- Otherwise nixie reads it from the backup sets at or after the newest forgotten record among the
  items, as [a forget's backup state](../deployment/backups.md#a-forgets-backup-state) describes.
- A bulk forget that found no item to delete reads complete, because it removed no key.

With the schedule on, a forget's own answer reads pending: the backup set taken after it publishes
at the backup job's next job run.

### Forgetting retired items in bulk

A bulk forget deletes a fixed set of retired items, each bound to the revision its preview showed.
In one transaction under the delivery lock, nixie checks every item and revision and appends one
record per item that marks it forgetting. A stale or unretired target rolls the transaction back, so
the bulk forget deletes no key unless every target holds. A restore after the preview moves its item
past the revision the preview showed, so that item fails as stale. An item retired after the preview
was never in the set, so the bulk forget leaves it alone.

The forgetting state reserves each item, because restore, undo and edit refuse an item that is
forgetting. The store then runs each item's cleanup in turn, stops at the first failure, and writes
each item its own forgotten record. A crash leaves the rest of the set forgetting, for the store's
start to finish.

### Forgetting every item

The reset of the memories, a host command, forgets every item that is active or retired, at its
current revision. The store reads the set inside the transaction that marks each item forgetting,
under the delivery lock, so a write that lands before the reset joins the set and a write that lands
after it waits for the lock. An item that an earlier forget took stays out of the set. The cleanup
then runs as it does for a bulk forget of retired items, one item at a time, and a crash leaves the
rest for the store's start.

## The model's tools

| Tool              | Effect         | Does                                                        |
| ----------------- | -------------- | ----------------------------------------------------------- |
| `memory.recall`   | `read`         | Recalls items by query, by ID, by topic or a page at a time |
| `memory.pending`  | `read`         | Lists the proposals that wait for the user's review         |
| `memory.remember` | `memory_write` | Creates an item, with a quote or a photo as its source      |
| `memory.edit`     | `memory_write` | Edits an item at a revision it read, with a quote           |
| `memory.retire`   | `memory_write` | Retires an item at a revision it read, with an intent quote |
| `memory.pin`      | `note`         | Asks to pin an item at a revision it read                   |
| `memory.unpin`    | `note`         | Takes an item out of the pinned core                        |

Each write tool runs its gate, and returns either the revision it applied or the proposal it became,
with its review reason. A missing quote never fails the tool, because the gate turns it into a
proposal. The result gives the review reason as its code and a fixed sentence that says why the
write waits for the user's review, rendered with the user's name and the gate's own evidence window,
so the model reads the rule the gate applied. The model never writes the sentence, so the reasons
stay a closed set.

Each tool takes its provenance from the task run: the conversation's thread gives the conversation
as origin, any other thread gives a task, and the run's model gives the model ID. nixie marks a
recall result as untrusted content, because any item it returns can hold untrusted text. The
`memory.recall` result gives each version its text and the line that says where it came from, in the
words the conversation reads ([how an item reads](./context.md#how-an-item-reads)). A past version's
line names the version that replaced or retired it. A stale revision, a missing item or a wrong
state returns to the model as the tool's refusal, so the model reads the item again. The model can
retire, pin and unpin an item and can never restore, undo or forget one ([pins](./writes.md#pins)).
Each tool runs direct, and the user's rules decide each call by the tool's declared effect:

- A tool that only reads declares `read`, which the starter rule `allow-reads` allows.
- A tool that only marks an item, such as a pin or an unpin, declares `note`, which the starter rule
  `allow-notes` allows.
- `memory.remember`, `memory.edit` and `memory.retire` declare `memory_write`, which no starter rule
  allows, so the memory gate decides them
  ([rules on memory writes](./writes.md#rules-on-memory-writes)).

`memory.pending` lists every pending proposal, the model's own and a task's, so the model knows what
it proposed after a compaction drops the turn it proposed in, and never proposes a change that
already waits. Each entry gives the proposal's short ID, text, review reason, age, and who noted it.
The tool lists and never answers, because only the user approves or rejects a proposal. nixie marks
its result as untrusted content, as it marks a recall result.

The records of a memory tool call never hold an item's text, so a forget leaves no readable copy in
them. A recall's result record lists only the items and versions it returned, and a pending call's
only the proposal IDs. Each call record leaves out the free text the model wrote, the search words,
the memory text and both quotes, because the model can copy an item's text into any of them. The
version keeps the memory text under its item's key.
