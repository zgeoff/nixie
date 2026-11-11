// Memory index: how a caller uses each shape. Not compiled. No package imports this file.
// The docs that point here: memory-labels.md, memory-revision.md, memory-index.md,
// memory-recall.md, memory-turn-push.md. Types: 02-types.ts. Flows: 03-flow.ts.
// Every text here is invented.

// ---- A. The agent writes an item with its labels ----

memory.remember({
  text: 'The piano is tuned each March by the same tuner.',
  gist: 'piano tuned each March by the same tuner',
  topic: 'home',
  triggers: ['piano', 'out of tune', 'book the tuner'],
  quote: 'the piano tuner comes every March, same one as always',
  eventID: '#5310',
  subject: 'owner',
});

// → { status, itemID: "c2hd81mmqa", version: 1, proposalID, reason, merged }

// ---- B. The agent edits an item ----

// A text edit with one label. `version` is the revision the agent read.
memory.edit({
  itemID: 'c2hd81mmqa',
  version: 1,
  text: 'The piano is tuned each April by the same tuner.',
  gist: 'piano tuned each April by the same tuner',
  quote: 'she moved the tuning to April',
  eventID: '#5402',
});

// → version: 2

// A label-only edit: no `text`. It is always a proposal. `triggers: []` clears the list.
memory.edit({ itemID: 'c2hd81mmqa', version: 2, topic: 'home/music', triggers: [] });
// → { status, itemID: "c2hd81mmqa", version: 2, proposalID: "…", reason: "labels", merged: false }
// Its approval moves the revision to 3. The text version is 2.

// ---- C. The proposal as memory.pending shows it ----

memory.pending({});
// → one proposal of the result:
// {
//   proposalID: "…", itemID: "c2hd81mmqa", version: 2,
//   gist: "piano tuned each April by the same tuner", topic: "home/music", triggers: [],
//   isLabelOnly: true
// }

// ---- D. The memory-index block at a session's opening ----

// The block's text: 02-types.ts, section P. The agent reads one item of it in full:
memory.recall({ itemIDs: ['c2hd81mmqa'] });

// ---- E. memory.recall, one call of each kind ----

// The plain list, a page at a time.
memory.recall({});
memory.recall({ after: '412' });

// A search of item text.
memory.recall({ query: 'piano tuner' });

// The lines of one topic. The result appends no record.
memory.recall({ topic: 'home' });
// → {
//   lines: [
//     { itemID: "c2hd81mmqa", gist: "piano tuned each April by the same tuner", subject: "owner" }
//   ],
//   next: null,
//   searched: { topic: "home" }
// }

// The list of topics.
memory.recall({ topics: true });
// → { topics: [{ topic: "home", subject: "owner", items: 3 }], next: null,
//     searched: { topics: true } }

// One subject alone, a full page.
memory.recall({ subjects: ['self'], limit: 100 });
// → {
//   items: [{ itemID: "k3v9x2ab1c", subject: "self", text: "I like short replies.", … }],
//   next: "cursor-of-the-last-kept-item",
//   searched: { subjects: ["self"] },
//   leftOut: { count: 62, itemIDs: [], versions: 0 }
// }

// A recall that finds nothing.
memory.recall({ topic: 'garden' });
// → { lines: [], next: null, searched: { topic: "garden" } }

// 30 named IDs with no `limit`: 20 items, and the other 10 in the order named.
memory.recall({ itemIDs: [/* 30 short IDs */] });
// → { items: [/* 20 */], next: null, searched: { itemIDs: [/* 30 */] },
//     leftOut: { count: 10, itemIDs: [/* the 10 */], versions: 0 } }
// The agent names the 10 in a second call.

// An item with its history.
memory.recall({ itemIDs: ['c2hd81mmqa'], includeHistory: true });

// → the item's `version` is its revision, 3. Each text version of its history holds
//   `textVersion`, and each label row holds `revision`.

// ---- F. The config keys ----

//   memory:
//     index_tokens: 3000
//     index_fold_order: largest-first
//     index_item_order: newest-first
//     index_topic_page: 200
//     trigger_items: 3
//     trigger_min_score: <a number>     (open: trigger floor)

// ---- G. The sessions module asks memory ----

// Once, when a session opens:
const index = await memory.readIndex({ thread });

// index.text is the memory-index block. The counts fill the 2 status lines.

// Once per turn:
const turnMemory = await memory.readTurnMemory({
  text: 'is the piano out of tune again?',
  thread,
  excludedWords: ['Robin'],
  held: { readVersions, readMessages },
});
// → { kind: "placed", items: [/* the piano item */], selfNotes: [], messages: [] }
// → { kind: "none" } when nothing passes the floor
