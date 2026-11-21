# The notebook

- **Status:** draft
- **Work items:**
  [the assistant keeps a notebook of linked pages](https://linear.app/zgeoff/issue/GEO-2726), with
  [images](https://linear.app/zgeoff/issue/GEO-2728) for the pictures a page shows and
  [devices](https://linear.app/zgeoff/issue/GEO-2758), which show a page on a screen

The assistant gets a notebook: pages it writes, edits, searches, links and walks, kept apart from
memory. A page has a short ID, a title, a markdown body of up to 50,000 characters, tags and
versions, and a typed link from a page can point at another page, a memory item, a moment or an
event of the log. A page never comes to the assistant on its own: no retrieval, opening or block
shows one, so the assistant reads a page only when it opens or searches the notebook. You read every
page, its links and its backlinks in the web client, which shows the notebook read-only and offers
one control, the forget of a page.

## Shape

```mermaid
flowchart LR
  model[assistant] -->|"notebook.*"| tools[notebook tools]
  tools -->|"records with no thread"| log[(event log)]
  log -->|"fold"| tables[(pages, versions, links)]
  tools -->|"find"| index[page index in memory]
  index -->|"chunks and vectors"| encoder[text encoder]
  web[web client] -->|"notebook reads, forget"| api[API]
  api --> tables
  turn[per-turn retrieval] -->|"items only"| memory[(memory store)]
```

## Contracts

### The tools

```ts
notebook.write({
  title: 'Why the boiler keeps tripping',
  body: '## What I know\nThe trip happens after a cold night…',
  tags: ['home', 'boiler'],
});
// → { page: 'n4w8k2c6rd', version: 1 }

notebook.edit({
  page: 'n4w8k2c6rd',
  version: 1, // the version the assistant read; a later one makes the edit stale
  changes: [{ find: 'after a cold night', replace: 'after a night under 2 °C' }],
});
// → { page: 'n4w8k2c6rd', version: 2 }
//   an edit passes `body` for a whole new body, or `changes`, never both. Each `find` must match the
//   current body exactly once. title and tags replace their values when present, so tags: [] clears them

notebook.read({ page: 'n4w8k2c6rd' }); // version: 1 reads an older one; part pages a long body
// → { page: 'n4w8k2c6rd', version: 2, versionCount: 2, title: 'Why the boiler keeps tripping',
//     tags: ['home', 'boiler'], body: '## What I know\n…', part: 1, parts: 1,
//     updatedAt: '2026-11-21T08:10:00Z',
//     links: [{ type: 'cites', to: { event: '48213' }, reason: 'the engineer’s visit' }],
//     backlinks: [{ type: 'supersedes', from: 'h2m9t4x7qa', title: 'Boiler notes (old)' }] }

notebook.read({ page: 'n4w8k2c6rd', history: true });
// → { page: 'n4w8k2c6rd', history: [{ version: 1, at, writer: 'conversation', model }, …] }

notebook.find({ query: 'heating cuts out in winter', tags: ['home'] });
// → { pages: [{ page: 'n4w8k2c6rd', title: 'Why the boiler keeps tripping', tags: ['home', 'boiler'],
//               version: 2, updatedAt, match: '…the trip happens after a night under 2 °C…',
//               score: { words: 4.1, meaning: 0.52 } }], next: null }
//   by: 'words' | 'meaning' | 'both' (the default). tags alone lists every page that holds them all.
//   No query and no tags lists every page, newest edit first

notebook.find({ tidy: true });
// → { tidy: TidyReport }, the same report the web client shows

notebook.link({
  from: 'n4w8k2c6rd',
  to: { memory: 'b7kq2m9xza' },
  type: 'disputes',
  reason: 'the note blames the thermostat; the trips say otherwise',
});
// → { linked: true, isTargetFound: true }
//   isTargetFound: false for a target that does not exist; the link still lands
//   remove: true removes the link of that type to that target → { linked: false }, even when there was none

notebook.walk({ from: 'n4w8k2c6rd', hops: 2 });
// → { nodes: [{ page: 'n4w8k2c6rd', hops: 0, title: 'Why the boiler keeps tripping' },
//             { memory: 'b7kq2m9xza', hops: 1, gist: 'boiler serviced in March', state: 'active' },
//             { event: '48213', hops: 1, at: '2026-10-02T09:12:00Z', role: 'owner' },
//             { moment: 'm3c8v1k5wy', hops: 2, title: 'The engineer’s visit' }],
//     links: [{ from: 'n4w8k2c6rd', to: { memory: 'b7kq2m9xza' }, type: 'disputes', reason: '…' }, …],
//     missing: [{ page: 'q9z2w5r8tn' }], forgotten: [{ moment: 'k1v6c3m8xe' }], isCut: false }
```

```ts
// notebook module
type LinkTarget = { page: string } | { memory: string } | { moment: string } | { event: string };
// page, memory and moment take a short ID; event takes the decimal event ID that log.read shows.
// A UUID that resolves is stored as its short ID. Any other ID that fails the format is BAD_TARGET.

type LinkType = 'supersedes' | 'disputes' | 'part-of' | 'cites' | 'related';
// reason: one line, 1 to 200 characters; optional, and required for related

type NotebookWriteInput = { title: string; body: string; tags?: string[] };
// title: one line, 1 to 200 characters. body: 1 to notebook.page_chars characters.
// tags: 0 to 10, each one line of 1 to 40 characters, compared ignoring case

type WalkInput = { from: string; hops?: number; types?: LinkType[] };
// from: a page's short ID. hops: 1 to 3, default 1. types narrows the links the walk follows

interface TidyReport {
  orphans: { page: string; title: string }[]; // no link from it, and no link to it from a live page
  dangling: { from: string; to: LinkTarget; type: LinkType; state: 'missing' | 'forgotten' }[];
  untouched: { page: string; title: string; touchedAt: string }[]; // past notebook.tidy_untouched_days
  repeatedReasons: { reason: string; count: number; links: { from: string; to: LinkTarget }[] }[];
  // a related reason on more than notebook.tidy_reason_repeats links
}

// notebook.write, notebook.edit, notebook.link: effects ['note'], execution 'direct'
// notebook.read, notebook.find, notebook.walk: effects ['read'], execution 'direct'
// every result field that holds page, title, tag, reason, gist or match text is 'untrusted';
//   IDs, versions, counts and flags are 'owner_data'

// refusal codes, each a result with refusalCode, in the order the tool checks them
// UNKNOWN_PAGE, PAGE_FORGOTTEN: the page in page or from; the message holds its ID
// STALE_VERSION: an edit at a version the page has moved past; the result carries the current version
// PAGE_TOO_LONG: a body, or a body after its changes, past notebook.page_chars
// NO_MATCH, MANY_MATCHES: a change whose find matches 0 times or more than once; nothing applies
// UNKNOWN_VERSION: a read of a version the page never had
// BAD_TARGET: a target ID in no valid format
// BAD_LINK: a type that the kind rules refuse between these kinds
// REASON_REQUIRED: a related link with no reason
// SELF_LINK: a link from a page to itself
// PART_OF_CYCLE: a part-of link that closes a loop of part-of links
```

### Link kinds

| Type         | From | To                          | Meaning                                |
| ------------ | ---- | --------------------------- | -------------------------------------- |
| `supersedes` | page | page, memory                | this page replaces that one            |
| `disputes`   | page | page, memory                | this page argues with that; both stand |
| `part-of`    | page | page                        | this page belongs to that one          |
| `cites`      | page | page, memory, moment, event | this page rests on that                |
| `related`    | page | page, memory, moment, event | anything else, with its reason         |

A page holds at most one link of each type to each target. A second `notebook.link` with the same
source, target and type replaces the reason.

### The records

```text
notebook.page_written      -- the first version; no thread
  payload:  page (UUID), shortID, version 1, writer, model, chars
  erasable: title, body, tags
notebook.page_edited       -- each later version, written whole; no thread
  payload:  page, version, chars, writer, model
  erasable: title, body, tags
notebook.linked            -- a link, or a new reason for it; no thread
  payload:  from (UUID), to (LinkTarget), type
  erasable: reason, when present
notebook.unlinked          -- payload: from, to, type
notebook.page_forgetting   -- payload: page, version; the forget's first part
notebook.page_forgotten    -- payload: page; the forget's end
```

`writer` is the conversation or the task whose turn called the tool, and `model` is the model ID of
the task run, set from the turn and never from the tool's input. The page records sit on no thread,
so a [reset of the conversation](../../architecture/core/event-log.md#resetting-the-conversation)
leaves every page readable, as it leaves memory items. Each kind with erasable fields joins
`ErasableRecordKinds` in the notebook module, and `forgettableKinds` gains a fourth group that a
record forget leaves out: a page's own records, which the page's forget takes
([forgetting a record](../../architecture/channels/api.md#forgetting-a-record)).

### The tables

```text
notebook_pages                 -- notebook module
  page_id      text            -- primary key; the page's UUID
  short_id     text            -- from createShortID, carried in notebook.page_written
  state        text            -- 'active', 'forgetting' or 'forgotten'
  version      integer
  text_seq     integer         -- the record that holds the current title, body and tags
  created_at   integer
  touched_at   integer         -- the newest version, or link added from or to the page

notebook_versions
  page_id      text
  version      integer
  seq          integer         -- the record that holds this version's text
  writer       text            -- 'conversation' or a task ID
  model        text
  chars        integer
  created_at   integer

notebook_links
  from_page_id text
  target_kind  text            -- 'page', 'memory', 'moment' or 'event'
  target_id    text            -- a short ID, or an event ID
  type         text
  reason_seq   integer null    -- the notebook.linked record that holds the reason
  created_at   integer
  -- primary key (from_page_id, target_kind, target_id, type)
```

No table holds free text. The notebook module decrypts the current version of every active page at
its start, and keeps the titles, the tags, a keyword index and a vector index in process memory
only, as the [memory store's indexes](../../architecture/memory/store.md#the-indexes) do, because an
index on disk keeps a forgotten page's words.

### The config

```yaml
# deployment config; the notebook module reads it
notebook:
  page_chars: 50000 # the most characters of one body
  tidy_untouched_days: 90
  tidy_reason_repeats: 3
```

### The web client's reads

```ts
// contract lib
notebook.list({ query?: string, tags?: string[], after?: string });
// → { pages: [{ page, title, tags, version, updatedAt, backlinks: 3 }], next }
notebook.read({ page: 'n4w8k2c6rd', version?: 2 });
// → { page, version, versionCount, title, tags, body, links, backlinks, history }  // links carry the target's title or gist
notebook.readTidy({}); // → TidyReport
notebook.previewForget({ page: 'n4w8k2c6rd' });
// → { version: 2, title, versionCount: 2, links: 4, backlinks: 1 }
notebook.forget({ clientActionID, page: 'n4w8k2c6rd', version: 2 }); // a checked action
// → { forgottenAt, backup }  // backup read from the sets at or after notebook.page_forgotten
//   or PAGE_NOT_FOUND | STALE_VERSION
conversation.previewForget({ sequence }); // …existing fields, plus pages: { page, title }[] that link to the record
```

## Constraints

Keeping pages out of context:

- Per-turn retrieval, the pinned core, the memory index, the events block, the session status and
  the compaction instruction never read the notebook. The notebook module depends on memory, and a
  module never forms a cycle with another, so memory's retrieval has no path to a page. The notebook
  registers no entry in the events block or the session status.
- The page indexes are the notebook module's own. A page never enters the item index, the trigger
  index or the moments' vector index, and a page has no trigger phrases.
- `memory.recall` and `moment.read` never list the pages that link to an item or a moment. A
  backlink to an item shows only in `notebook.read`, `notebook.walk` and the web client.
- A task gets the notebook tools only when its tool list holds them. The conversation's tool list
  holds all 6.
- A retrieval test holds that a session's opening and every block before a turn's message hold no
  page text and no page ID, even when the message matches a page's title word for word.

Records and text:

- The call record of every notebook tool leaves out the title, the body, the tags, the changes, the
  reason and the query, and the result record holds page short IDs and versions only, with each UUID
  under `hidden.uuids` ([tool calls](../../architecture/connectors/tool-calls.md#records)). So a
  page forget leaves no readable copy in a tool's records, and `log.read` shows a notebook result as
  IDs only.
- A walk returns references and labels: a page's title, an item's gist and state, a moment's title
  and state, and an event's time and role. It never returns an item's text, a moment's text or a
  record's text, so `log.read` and `memory.recall` stay the only ways to read them.
- An event node shows its time and role only when the calling tool run may read its thread with
  `log.read`, and its ID alone otherwise. An item node shows its gist only to a tool run that reads
  memory.
- A body renders as a reply renders: markdown with no raw HTML and safe links only.
  `![alt](image:<image short ID>)` shows a stored image, and the web client and a device show "image
  unavailable" for an image that is unknown or forgotten. `notebook.read` returns the body as
  written, and the assistant opens an image with `image.read`.

Versions and limits:

- Every edit writes the whole new version, so reading any version decrypts one record. No version is
  ever rewritten.
- An edit binds to the version it read, and the check and the record commit in one write
  transaction. A link or an unlink never makes an edit stale.
- `notebook.read` pages a long body in parts that fit `recallPageLimitBytes`, cut at a paragraph
  break, then a line break, then a space. Every part repeats the title, the tags and the links.
- `notebook.find` returns at most 20 pages a call. Its words search matches any query word, as the
  item keyword index does, and its meaning search encodes the title, the tags and the body in chunks
  with the encoder and chunking of the item vector index, and ranks a page by its best chunk above
  the 0.3 floor of `memory.recall`. Reciprocal rank fusion merges the two.
- Before each search, the module encodes every page written or edited since the last search and
  waits, so a page written on one turn matches by meaning on the next.

Links and walks:

- The link kinds hold as the table shows, judged on the target's declared kind, so a link to a
  target that does not exist yet still passes or fails on its kind alone.
- A walk visits each node once, breadth first, and follows links both ways: a page's own links, and
  the links from other active pages to each node it reaches. So a walk passes through a memory item
  to the other pages that cite it.
- A walk stops at 200 nodes and sets `isCut`. `missing` lists each target with no row or no record,
  and `forgotten` lists each target whose page, item or moment was forgotten or destroyed, and each
  event whose key is gone, whether a record forget or a conversation reset took it. A target in
  either list is never a node, and the walk goes no further from it.
- `PART_OF_CYCLE` checks the part-of links that exist when the link commits.

Forgets:

- Only `notebook.forget` in the web client forgets a page. No tool reaches it, so the assistant can
  supersede or rewrite a page and never destroy one.
- A page forget runs in 2 parts, as a
  [moment destroy](../../architecture/memory/moments.md#destroying-a-moment) does. One write
  transaction commits the client action, checks the version and appends `notebook.page_forgetting`,
  and from then on no tool or read reaches the page. The cleanup deletes the key of every version
  record and every `notebook.linked` record from the page, drops the page from the indexes, runs the
  [session cleanup](../../architecture/memory/context.md#forgetting-and-the-live-session) with the
  page as its cause, and appends `notebook.page_forgotten`. Each step is safe to run twice, and the
  server's start finishes a forget that a crash cut short.
- `notebook.page_forgotten` is a forget record to the backup schedule, beside the 4 kinds that
  [staging a set](../../architecture/deployment/backups.md#staging-a-set) lists, so it makes a
  forget set due.
- The session cleanup runs for the conversation and for each open task whose tool list holds
  `notebook.read`, `notebook.find` or `notebook.walk`.
- A page forget drops the page's own links. A link from another page to it stays, and reads as
  `forgotten` in a walk and as dangling in the tidy report.
- A forget of a link's target, an item, a moment or a record, leaves the link in place. The fold
  never removes it, and the walk lists the target in `forgotten`. A page's text that quotes the
  target stays until you forget the page, so `conversation.previewForget` lists each page that links
  to the record, and the confirmation shows that those pages keep their text.
- A device that shows a page gets the idle event when `notebook.page_forgetting` commits, as the
  devices design asks.
- `device.show` with `{ kind: 'page', page }` sends the screen the current version's title and body
  as markdown, decrypted by the server, because a device session holds no key. A body past the
  screen's 20,000 characters shows its first 20,000 and a line that the page goes on. An image that
  the body embeds counts as part of the show for `devices.readImage`.

The tidy report:

- The notebook module builds the report when it is read and stores nothing, so it holds no copy of a
  page's text. The web client's notebook page shows it on a tab of its own, and the assistant reads
  it only with `notebook.find({ tidy: true })`.
- An orphan is an active page with no link from it and no link to it from an active page. A page is
  untouched when its `touched_at` is older than `notebook.tidy_untouched_days`. A read never counts
  as a touch.
- Two reasons are the same when they match after trimming, collapsing runs of spaces and ignoring
  case.

The web client:

- The bar gains a Notebook link, its eleventh. `/notebook` lists the pages newest edit first,
  searches by words, meaning and tags with `notebook.list`, and opens each page at
  `/notebook/<page short ID>`.
- A page shows its body, tags, versions with a word diff between each and the one before, its links
  grouped by type with their reasons and their targets' titles or gists, and its backlinks. A target
  links to its own view: a page, the memory view, a moment, or the record in its thread. A missing
  or forgotten target shows as such.
- The page view has no control that writes, except Forget, which opens a confirmation from
  `notebook.previewForget`.

Memory guidance:

- The descriptions of `memory.edit` and `memory.retire` gain one sentence: when you change your mind
  about an item, edit or retire it, and keep the argument in the notebook, linked to the item with
  `supersedes` or `disputes`.

## Decisions

- **Pages are records of the log with no thread.** The encrypted log, its backups and its history
  cover them, and neither a conversation reset nor a task's close shreds them.
- **The notebook is its own module, beside memory and never inside it.** A dependency that runs one
  way only keeps every path that builds context unable to read a page.
- **A link carries its target's kind.** A target that does not exist yet has no row to read a kind
  from, and a short ID alone does not show whether it belongs to a page, an item or a moment.
- **Only you forget a page.** The assistant's memory tools never forget an item either, so a misread
  "drop that" never destroys a page.
- **A walk returns labels, never text.** The text of an item, a moment or a record stays behind the
  tool that checks who may read it.
- **The tidy report is a read.** A report that nixie pushed would list pages the assistant never
  asked for, so the report reaches the assistant only when it asks, or when a task definition you
  write asks on a schedule.

## Builder decides

- The tools' descriptions, beyond the memory guidance sentence.
- The indexes on the tables, and the migration's number.
- How `notebook.find` and `notebook.list` page, and the length of `match`.
- The refusal wording, and how the web client lays out the list, the page and the tidy tab.

## Out of scope

- Links that start from a memory item, a moment or an event.
- A page in retrieval, the pinned core or the memory index.
- Editing a page in the web client.
- Forgetting one version of a page. A forget takes the whole page.
- Links inside a body. A body's markdown links are text, and a walk follows only the links that
  `notebook.link` made.

## Open questions

- **Should a weekly tidy report reach the assistant on its own?** The owner settles it, because a
  report that lists pages the assistant never asked for breaks the rule that a page never comes to
  it on its own. Until then, the report reaches the assistant only through
  `notebook.find({ tidy: true })`.
- **Is Forget the right one control in a read-only notebook view?** The owner settles it. Until
  then, the page view offers Forget, because without it a page that quotes a forgotten message keeps
  that text until a full reset.
