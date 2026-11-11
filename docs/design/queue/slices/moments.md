# Moments: the work as slices

Slices 1 and 2 are designed and buildable. Slices 4 to 6 are designed and wait for the choices that
slice 3 closes. Slices 7 to 9 are decisions: their work has no designed shape, so each lists what
you decide first and builds nothing. Each "Needs" line is a settled dependency. Open items are in
[the open list](../open/moments.md). The sketches are in `../sketches/moments/`.

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. Tests are in the
unit lane unless marked.

Each slice has the ID `moments-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `moments-n`.
[The work list](../work-list.md) gives the build order.

### moments-1. A forget of a record reaches the task's session

- **Outcome:** A forget of a record on the thread of an open started task cleans that task's
  session, whether or not the task reads memory.
  [The forget issue](https://linear.app/zgeoff/issue/GEO-2527).
- **Follows:** "The cleanup picks the task that holds the record" and "The order of a forget" in
  [a forget and a task's session](../forget-and-task-sessions.md); `01-usage.ts`, section A;
  `02-types.ts`, section A; `03-flow.ts`, section A.
- **Needs:** nothing. Open items first: (open: forget cause), (open: ended task sandbox), (open:
  pick signature).
- **Steps:**
  1. Write the 2 tests on the code as it stands, and quote each one failing in the pull request.
  2. Write the fix.
  3. Rename the existing case "it picks only the tasks that read memory" so that its name gives the
     causes it covers: a forgotten memory item and a destroyed moment.
- **Check:**
  - `bun test modules/sessions/src/plan-task-session-cleanup.test.ts`, 1 added case: 2 open tasks,
    neither of which reads memory, and a forgotten record on the thread of the first. The pick
    returns the first task only.
  - `bun test modules/sessions/src/start-nixie-runner.test.ts`, 1 added case: one open started task
    with `memory: 'none'` and a reply on its thread. The test calls the runner's `cleanupSessions`
    with `{ recordSequence }`, and reads a `model.session_invalidated` record and a
    `model.session_cleanup_completed` record on that task's thread.
  - Both added cases fail without the fix and pass with it. This check rests on (open: forget
    cause): when the second case passes without the fix, the slice ends with no fix.
  - The renamed case passes for `{ itemID }` and `{ momentID }`.
- **Order:** this slice lands before moments-4, because tool records sit on a task's thread as often
  as on the conversation's, and moments-4 widens the defect to them. It shares no code path with
  moments-2. That it lands before moments-2 has no stated reason. (open: moments slice order)
- **Rollback:** no migration and no deploy step. The release before reads every record that the fix
  writes, so a rollback needs nothing.
- **Milestone:** 1.

### moments-2. Photos in a kept moment

- **Outcome:** `moment.read` and the memory export list the images of each message of yours in a
  span, and the agent opens one with `log.read_image`.
  [The photos issue](https://linear.app/zgeoff/issue/GEO-1913).
- **Follows:** "A span record lists its images", "The agent opens an image from a pointer", "The
  memory export lists the same images" and "How the image design is checked" in
  [moments](../moments.md); `01-usage.ts`, sections B and C; `02-types.ts`, sections B to E;
  `03-flow.ts`, sections B and C.
- **Needs:** nothing. Open item first: (open: photo description sentences). The builder writes the 2
  sentences to the intended content.
- **Steps:**
  1. `buildSpanEntry` returns `images`, and `toEntryJSON` of `moment.read` passes it on.
  2. Change the 2 tool descriptions.
  3. Add `images` to the export's span record and raise `memoryExportSchemaVersion` by one. The
     schema reads a file of the version before with every list empty.
- **Check:**
  - `bun test modules/memory/src/read-moment-span-page.test.ts`: a span with a message of 2 photos
    returns 2 pointers, and none once the message is forgotten. A cut record returns its whole list.
  - `bun test modules/memory/src/build-log-read-image-tool.test.ts`: the tool opens a photo by a
    pointer from `moment.read`, and returns `imageUnavailable` of `02-types.ts`, section E, for a
    forgotten message and for a record of another thread.
  - `bun test modules/memory/src/read-moment-export.test.ts`: the export shows each photo's pointer.
  - `bun test modules/memory/src/memory-export-schema.test.ts`: a file of the version before reads
    with empty lists.
  - e2e lane, `bun run test:e2e`: the slice creates `e2e/moment-photo.test.ts`, on
    `startSpawnedNixie`. The test sends a message with an invented photo, and a kept moment covers
    that message. It scripts the model with `model.addReplies` to call `moment.read` and then
    `log.read_image` with the pointer it got. The turn's records show the `log.read_image` call with
    the status ok.
  - No check uses a live model. The live step on a preview is yours, and gates nothing. (open: photo
    preview command)
- **Order:** this slice and moments-5 both change `buildSpanEntry` and the export schema. Either
  lands first, and the second rebases on the first. Between the two, the export version is one above
  the built version. When both ship in one release, the version rises once, to 7, for `images` and
  `isRemoved` together. web-3, the slice of [short IDs](../short-ids.md) that puts short IDs in tool
  records, rewrites the stored `record` of the 6 moment tools, in the file of `moment.read`. Either
  lands first, and the second rebases on the first.
- **Rollback:** the release before reads the tool result with `images`. It cannot read an export
  file of the raised version, because its span record is a strict object. Export again after a
  rollback.
- **Milestone:** 4.

### moments-3. Decide the parts of redaction

- **Outcome:** You have chosen which of the 3 redaction parts get built, the record kinds, who
  redacts, what happens to a memory item whose evidence is the record, and the name of the preview
  procedure. [The redaction issue](https://linear.app/zgeoff/issue/GEO-384) holds only the chosen
  parts, or is closed as done. The sentence of the
  [moments design](../../platform/memory/moments.md) that lists redaction as not built states what
  the forget of one message does. (open: redaction listed as not built)
- **Follows:** [redaction](../redaction.md), and the 5 redaction items under "Not decided" in the
  open list.
- **Needs:** nothing.
- **Check:** each of the 5 items has one chosen option, written in the issue, and
  [redaction](../redaction.md) holds no `(open: ...)` mark for them.
- **Milestone:** no deploy.

### moments-4. A redaction takes tool records

[The redaction issue](https://linear.app/zgeoff/issue/GEO-384).

- **Outcome:** `conversation.forget` removes a record of each chosen kind, and the web client's list
  of kinds in its record item component matches `forgettableKinds`.
- **Follows:** "The forget of a whole record" and "Part 1: a redaction of a tool record" in
  [redaction](../redaction.md); `01-usage.ts`, section D; `02-types.ts`, section F.
- **Needs:** moments-1, moments-3. Open items: (open: redaction parts), (open: redaction kinds).
- **Check:**
  - `bun test modules/api/src/write-record-forget.test.ts`: the forget removes a tool result inside
    a span, and returns `RECORD_NOT_FOUND` for a record of a kind outside the chosen set.
  - `bun test modules/api/src/run-record-forget-cleanup.test.ts`, 1 added case: a forget of a tool
    result deletes its key and commits `record.forgotten`.
  - The existing suites of the message index and of the summary keys pass with this slice and
    without it. They prove nothing here, and are no check.
- **Rollback:** no migration. The release before returns `RECORD_NOT_FOUND` for the added kinds.
- **Milestone:** 4.

### moments-5. The removal mark

[The redaction issue](https://linear.app/zgeoff/issue/GEO-384).

- **Outcome:** `moment.read`, the client's `readMomentSpan` and the memory export return `isRemoved`
  on each span record, and the moment view words a removed record apart from any other gap.
- **Follows:** "Part 2: the removal mark" in [redaction](../redaction.md); `02-types.ts`, section G;
  `03-flow.ts`, section D.
- **Needs:** moments-3. Open items: (open: redaction parts), (open: removal sentence). It does not
  need moments-4: a removed message has the mark too.
- **Steps:** add `isRemoved` at the 4 places that hold `isGap`: `buildSpanEntry`,
  `toMomentSpanRecord`, the moment contract of the API contract package, and `spanRecordSchema` of
  the memory export. Raise `memoryExportSchemaVersion` by the rule in slice 2.
- **Check:**
  - `bun test modules/memory/src/read-moment-span-page.test.ts`, 3 added cases: `isRemoved` is true
    at a forgotten record's place, false for a record with an unreadable key, and false for a
    session summary whose key a session cleanup deleted.
  - `bun test modules/memory/src/memory-export-schema.test.ts`: a file of the version before reads
    with `isRemoved` false.
  - e2e lane, `bun run test:e2e`: the slice creates `e2e/record-forget-moment.test.ts`. It removes a
    record through the API, restarts nixie, and reads the moment with the mark.
  - `bun run ci:compatibility:run-contract-growth-check` passes, because the contract only grows.
- **Order:** see moments-2 for the shared code and the export version.
- **Rollback:** the release before reads `isRemoved` on a tool result and on `readMomentSpan`, where
  a client of that release ignores the field. It cannot read an export file of the raised version,
  because its span record is a strict object.
- **Milestone:** 4.

### moments-6. The moment view offers the removal

[The redaction issue](https://linear.app/zgeoff/issue/GEO-384).

- **Outcome:** The moment view shows the removal control on each span record of a kind that the
  forget takes, behind a preview that counts the moments and the memory items.
- **Follows:** "Part 3: the removal control in the moment view" in [redaction](../redaction.md);
  `02-types.ts`, section H; `03-flow.ts`, section E.
- **Needs:** moments-3. Open items: (open: redaction parts), (open: redaction actor), (open:
  redaction evidence items), (open: preview procedure name), (open: preview order). With moments-4,
  the control also shows on tool records. With moments-5, the removed record shows its mark.
- **Check:** no test is agreed for this part. (open: removal control tests) The intended tests, each
  resting on the open items above:
  - a unit test of the preview procedure in the API module: it counts 2 moments whose spans hold one
    record, and 1 memory item whose evidence quotes it;
  - a component test of the moment view: the control is hidden when the preview read fails.
- **Rollback:** the release before has no preview procedure. A client of this slice hides the
  control when the call fails.
- **Milestone:** 4.

### moments-7. Decide a moment across several threads

- **Outcome:** You have answered the 4 choices, in the order of the open list: (open: reopen moment
  definition), (open: span adder), (open: span read order), (open: photo thread). When decision
  record 0037 is not reopened, [the several-threads issue](https://linear.app/zgeoff/issue/GEO-385)
  closes as not planned. When it is reopened, a design of the shape exists that meets the settled
  rules, and it closes (open: parked rollback).
- **Follows:** [a moment across threads](../moment-across-threads.md).
- **Needs:** nothing for the decision. A build of the shape is in no slice. It needs moments-2 and
  moments-4 to moments-6, or your choice not to build them, because each changes the span record.
- **Check:** the issue holds each answer. A design, when one is written, holds these tests:
  - `bun test modules/memory/src/write-kept-moment.test.ts`: you keep a moment over 2 threads, and
    the store refuses a model's span on a thread that your choice does not allow.
  - `bun test modules/memory/src/read-moment.test.ts`: the moment's records come in the chosen order
    across a page boundary, each with its thread.
  - `bun test modules/memory/src/moments-projection.test.ts`: a moment with one span, kept by the
    built code, folds to the same rows.
- **Milestone:** no deploy.

### moments-8. Decide replay checks

- **Outcome:** You have answered the 6 replay choices of the open list, and a design of the mark,
  the replay's input and the report exists that meets the 3 requirements. The design closes (open:
  parked rollback). [The replay issue](https://linear.app/zgeoff/issue/GEO-387).
- **Follows:** [replay checks](../moment-replay-checks.md).
- **Needs:** nothing from a slice for the decision. (open: turn-input log choices), unless you
  choose an input rebuilt from the span. A build is in no slice. It needs harnesses-3, the harness
  boundary of [model harnesses](../model-harnesses.md), to offer one model turn from a supplied
  input with every tool stubbed. Unless the input is rebuilt from the span, it also needs a read of
  a logged request by nixie, and harnesses-9, the turn-input log.
- **Check:** the issue holds each answer. A design, when one is written, holds these checks. Each
  file is one that the build creates, and the design can rename it:
  - `bun test modules/memory/src/run-moment-replay.test.ts`: a replay of a seeded moment on a
    swapped profile, with a stub in place of the model, reports the difference. A replay whose model
    calls a sending tool gets the stub's answer and writes no action record.
  - An offline harness, run by hand with a local model login, as the memory writer eval is:
    `env -u ANTHROPIC_API_KEY bun evals/moment-replay/run-moment-replay-eval.ts`, then
    `bun test evals`. This lane calls a real model and sends no turn to any deployment.
  - The pull request that adds the harness adds its row to the table of evidence lanes.
- **Milestone:** no deploy.

### moments-9. The design session on rule reasons

- **Outcome:** A decision record that you agreed, and a moments design that matches it.
  [The rule link issue](https://linear.app/zgeoff/issue/GEO-386) is rewritten in place or closed as
  not planned. A rewritten issue closes (open: parked rollback).
  [The rule reason session](https://linear.app/zgeoff/issue/GEO-2021).
- **Follows:** [rule reasons](../rule-reasons.md), and its 4 questions in order.
- **Needs:** nothing from a slice. Only you. The session runs at any time. Its third question reads
  [redaction](../redaction.md).
- **Check:** the decision record exists, and the moments design matches it.
- **Milestone:** no deploy.
