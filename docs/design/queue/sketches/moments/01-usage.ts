// Moments: how a caller uses each shape. Not compiled. No package imports this file.
// The docs that point here: forget-and-task-sessions.md, moments.md, redaction.md.
// Types: 02-types.ts. Flows: 03-flow.ts.
// A moment across threads, replay checks and rule reasons have no agreed shape, so this file
// holds none for them.

// ---- A. You forget a reply on the thread of an open started task ----

// The checked action of the API. `thread` is the task's ID, because a task's thread is its ID.
conversation.forget({
  clientActionID: 'c1f0a7e2-5b1d-4c58-9a44-0d2e6b7f3a10',
  thread: '8e0c5d0a-3f6b-4a57-b2a1-6c1d2e9f4b77', // an open started task with memory: 'none'
  sequence: 5120, // a model.reply record on that thread
});

// The records that the forget writes, in order:
//
//   record.forget_started               { recordSequence: 5120 }
//   model.session_invalidated           { recordSequence: 5120 }   on the task's thread
//   model.session_cleanup_completed     { recordSequence: 5120 }   on the task's thread
//   record.forgotten                    { recordSequence: 5120 }

// The sessions module picks the tasks to clean. The record's thread is the second argument.
// (open: pick signature)
pickCleanedTaskIDs(
  [
    { taskID: 'task-fuse-box', setup: { options: { memory: 'none' } } },
    { taskID: 'task-cafe-hours', setup: { options: { memory: 'none' } } },
  ],
  'task-fuse-box', // the thread of the forgotten record
);

// → ["task-fuse-box"]

// A forgotten memory item or a destroyed moment has no record thread.
pickCleanedTaskIDs(
  [
    { taskID: 'task-fuse-box', setup: { options: { memory: 'none' } } },
    { taskID: 'task-garden-notes', setup: { options: { memory: 'read' } } },
  ],
  null,
);

// → ["task-garden-notes"]

// ---- B. The agent reads a moment and opens one of its photos ----

moment.read({ momentID: 'm4k9', records: 'conversation' });
// → one record of `records`:
//
//   {
//     "eventID": "4182",
//     "kind": "owner_message",
//     "recordedAt": "2026-03-04T09:12:44.000Z",
//     "source": "owner",
//     "payload": { "images": [{ "mediaType": "image/jpeg" }, { "mediaType": "image/png" }] },
//     "decision": null,
//     "text": "Here is the label on the fuse box.",
//     "images": [
//       { "n": 1, "mediaType": "image/jpeg" },
//       { "n": 2, "mediaType": "image/png" }
//     ],
//     "isGap": false,
//     "isCut": false
//   }

// The pointer to an image is the record's `eventID` with the image's `n`.
log.read_image({ eventID: '4182', number: 2 });
// → { eventID: "4182", number: 2, mediaType: "image/png" }, with the image itself

// The same record once you forgot the message. The payload lists the media types, and `images`
// is empty.
//
//   {
//     "eventID": "4182",
//     "kind": "owner_message",
//     "payload": { "images": [{ "mediaType": "image/jpeg" }, { "mediaType": "image/png" }] },
//     "text": null,
//     "images": [],
//     "isGap": true,
//     "isCut": false
//   }

log.read_image({ eventID: '4182', number: 2 });

// → an error with imageUnavailable of 02-types.ts, section E

// ---- C. The memory export lists the same images ----

// One span record of a moment in the export file, at the schema version of 02-types.ts,
// section D:
//
//   {
//     "sequence": 4182,
//     "kind": "owner_message",
//     "recordedAt": "2026-03-04T09:12:44.000Z",
//     "source": "owner",
//     "payload": { "images": [{ "mediaType": "image/jpeg" }, { "mediaType": "image/png" }] },
//     "decision": null,
//     "text": "Here is the label on the fuse box.",
//     "images": [
//       { "n": 1, "mediaType": "image/jpeg" },
//       { "n": 2, "mediaType": "image/png" }
//     ],
//     "isGap": false
//   }

// ---- D. You remove one record of a span ----
// Every part of this section waits for a choice. (open: redaction parts)

// The removal is the forget of section A. The record here is a tool result.
// (open: redaction kinds)
conversation.forget({
  clientActionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
  thread: 'conversation',
  sequence: 4190, // a tool_result record that holds a pasted key
});

// The moment view asks for a preview before it offers the removal.
// (open: preview procedure name)
conversation.readForgetPreview({ thread: 'conversation', sequence: 4190 });
// → { momentCount: 2, memoryItemCount: 1 }

// The removed record in a moment.read result:
//
//   { "eventID": "4190", "kind": "tool_result", "text": null, "isGap": true, "isRemoved": true }
//
// A record whose key fails to decrypt:
//
//   { "eventID": "4201", "kind": "model.reply", "text": null, "isGap": true, "isRemoved": false }
