# Moments: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`. The docs are
[a forget and a task's session](../forget-and-task-sessions.md), [moments](../moments.md),
[a moment across threads](../moment-across-threads.md), [replay checks](../moment-replay-checks.md),
[redaction](../redaction.md) and [rule reasons](../rule-reasons.md). The slices are in
[the slices](../slices/moments.md).

The issues: [the forget issue](https://linear.app/zgeoff/issue/GEO-2527),
[the photos issue](https://linear.app/zgeoff/issue/GEO-1913),
[the redaction issue](https://linear.app/zgeoff/issue/GEO-384),
[the several-threads issue](https://linear.app/zgeoff/issue/GEO-385),
[the replay issue](https://linear.app/zgeoff/issue/GEO-387),
[the rule reason session](https://linear.app/zgeoff/issue/GEO-2021) and
[the rule link issue](https://linear.app/zgeoff/issue/GEO-386).

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 1: forget cause; ended task sandbox; pick signature; cleanup task set.
- Slice 2: photo description sentences.
- Slice 4: redaction parts; redaction kinds.
- Slice 5: redaction parts; removal sentence.
- Slice 6: redaction parts; redaction actor; redaction evidence items; preview procedure name;
  preview order; removal control tests.
- Slice 7: reopen moment definition.
- Slice 8: turn-input log choices.
- Slice 9: rule link need.

## Not decided

Redaction ([the redaction issue](https://linear.app/zgeoff/issue/GEO-384)):

- **redaction parts.** Milestone 4. Blocks slices 4, 5 and 6. Which of the 3 parts get built: (a)
  the issue narrows to the parts you pick; (b) the issue closes as done. Intended: (a), with tool
  records and the removal mark, in that order. The order of worth is tool records, then the mark,
  then the removal control.
- **redaction kinds.** Milestone 4. Blocks slice 4. Which record kinds a redaction takes: (a)
  messages and replies only, as built; (b) every record of a thread that has a key, except a
  moment's or a memory item's own records; (c) the same as (b), only for a record inside a kept
  span. Intended: (b).
- **redaction actor.** Milestone 4. Blocks slice 6. Who redacts: (a) you in the client only; (b) a
  tool for the agent as well. Intended: (a), so that no tool removes a record.
- **redaction evidence items.** Milestone 4. Blocks slice 6. What a redaction does to a memory item
  whose evidence is the record: (a) the preview lists each item, and you forget each apart; (b) the
  redaction forgets each item too. Intended: (a).
- **preview procedure name.** Milestone 4. Blocks slice 6. The name of the read procedure behind the
  removal preview. Intended: `conversation.readForgetPreview`.

Photos and several threads ([the photos issue](https://linear.app/zgeoff/issue/GEO-1913),
[the several-threads issue](https://linear.app/zgeoff/issue/GEO-385)):

- **photo thread.** Milestone: no deploy. Blocks no slice. Which threads the agent opens a moment's
  photo from: (a) the caller's own thread only, as built; (b) any thread, when the caller passes the
  moment that holds the image. Intended: (a), which changes no code, and (b) only together with a
  moment across threads.
- **reopen moment definition.** Milestone: no deploy. Blocks slice 7. Whether to reopen decision
  record 0037 for several threads: (a) no, so a moment has one thread and the issue closes as not
  planned; (b) reopen it and change the definition; (c) reopen it and change the definition and its
  choice 2. Intended: (a), until a kept moment shows the need. (b) costs a record shape that is in
  the log for good.
- **span adder.** Milestone: no deploy. Blocks no slice. Who adds a span of another thread to a
  moment: (a) you only, in the client, while a model adds a span of its own thread; (b) the
  conversation as well, for a task it started; (c) any model. Intended: (a), the one option that
  fits choice 2 of decision record 0037.
- **span read order.** Milestone: no deploy. Blocks no slice. The order in which `moment.read`
  returns several spans: (a) all records by sequence, so 2 threads interleave by time; (b) one span
  after another. Intended: (a), with each record's thread.

Replay checks ([the replay issue](https://linear.app/zgeoff/issue/GEO-387)):

- **check marker.** Milestone: no deploy. Blocks no slice. Who marks a moment as a check: (a) you
  only; (b) the agent as well. Intended: (a).
- **replay start.** Milestone: no deploy. Blocks no slice. What starts a replay: (a) you, by a host
  command; (b) you, in the client; (c) nixie, when it starts on a changed profile. Intended: (a).
  Only (a) fits "only you open a logged request", and (c) spends model calls that nobody asked for.
- **replay input.** Milestone: no deploy. Blocks no slice. Where a replay's input comes from: (a)
  the logged request only, so nixie refuses a moment with none and gives the reason; (b) a copy of
  the logged request, stored with the check when you mark it, under a key that the moment's destroy
  and a forget of its thread delete; (c) an input rebuilt from the span and the prompt as it stands
  at the replay. No intended option: it follows the turn-input log's choices. Under that log's
  intended form, (a) gives almost no moment to replay, so the work is worth building only with (b)
  or (c). (b) holds a copy past the log's retention limit. (c) is not the input that the recorded
  model received, so a difference from the recorded outcome alone proves nothing.
- **replay provider consent.** Milestone: no deploy. Blocks no slice. Whether a replay may send a
  span to a provider that never saw it: (a) nixie asks you before each replay and gives the
  provider; (b) a mark is consent for every profile. Intended: (a).
- **replay result place.** Milestone: no deploy. Blocks no slice. Where a replay result lives: (a) a
  record under its own key, which a destroy of the moment shreds; (b) the command's output only.
  Intended: (a).
- **replay real cases.** Milestone: no deploy. Blocks no slice. Real kept moments as cases in the
  offline harness: (a) invented cases only; (b) your memory export as well. Intended: (a).
- **turn-input log choices.** Milestone: no deploy. Blocks slice 8. The
  [turn-input log](https://linear.app/zgeoff/issue/GEO-2355) is the harnesses family's work, and 6
  of its choices are open in [the harnesses list](harnesses.md#not-decided): "forget and the log",
  "retention limit", "log default", "log roles", "production routing" and "capture and store". The
  replay design waits for them, unless a replay's input is rebuilt from the span.

Rule reasons ([the rule reason session](https://linear.app/zgeoff/issue/GEO-2021),
[the rule link issue](https://linear.app/zgeoff/issue/GEO-386)):

- **rule link need.** Milestone: no deploy. Blocks slice 9. Whether a rule needs a link: (a) no
  link, and the reason is the rule's `note`; (b) a link beside the note; (c) no link in the rule,
  and a memory item states the rule's reason and links onward. Intended: (a), until a case shows
  that a note is not enough.
- **rule link target.** Milestone: no deploy. Blocks no slice. What a link targets: (a) a moment;
  (b) one record, such as one message; (c) either. No intended option.
- **rule link gone target.** Milestone: no deploy. Blocks no slice. What a link shows when its
  target is gone: (a) the rule loads and shows the link as gone; (b) the seed reports the link as a
  fault; (c) the link carries a short text of its own that outlives the target. No intended option.
- **item because links.** Milestone: no deploy. Blocks no slice. Whether the "because" links of
  memory items have the same problem: (a) no change to them; (b) an item links to one record as
  well. No intended option.
- **rule moment reference.** Milestone: no deploy. Blocks no slice. How a rule in YAML refers to a
  moment's ID. No option is stated. The choice exists only when the link's target is a moment, or
  either a moment or a record.

Order:

- **moments slice order.** Milestone 4. Blocks no slice. These orders have no stated reason, and are
  not settled: the forget fix before photos; and tool records, then the removal mark, then the
  removal control, as 3 pull requests in that order. The dependency facts in the slices are settled.

## Not checked

- **forget cause.** Milestone 1. Blocks slice 1. A forgotten reply is in the session of an open task
  that reads no memory. The cause is read from the code. Write the 2 tests of slice 1 on the code as
  it stands and run `bun test modules/sessions/src/plan-task-session-cleanup.test.ts` and
  `bun test modules/sessions/src/start-nixie-runner.test.ts`. Both fail: the fault is reproduced,
  and the fix builds to the design. The second passes: another path cleans the task's session. Write
  no fix, and name that path in the pull request.
- **ended task sandbox.** Milestone 1. Blocks slice 1. The sandbox of an ended task holds no
  transcript with a forgotten record. Write a test in
  `modules/sessions/src/start-nixie-runner.test.ts` that ends a started task, forgets a reply on its
  thread and lists the task's sandboxes, and run
  `bun test modules/sessions/src/start-nixie-runner.test.ts`. The list is empty: the fix covers open
  tasks only. The list holds a sandbox: the fix also cleans a task that ended, and the pick reads
  more than the open tasks.

## Not written

- **pick signature.** Milestone 1. Blocks slice 1. How `pickCleanedTaskIDs` receives the record's
  thread. The design says only that the runner reads the thread by the sequence and that the pick
  returns the task on it. The sketch passes the thread as a second argument, `null` for the other 2
  causes.
- **photo description sentences.** Milestone 4. Blocks slice 2. The sentence about images in the
  description of `moment.read`, and the words that name `moment.read` in the description of
  `log.read_image`. The intended content: pass a record's `eventID` and an image's `n` to
  `log.read_image`, and an image of another thread's moment is unavailable.
- **photo preview command.** Milestone 4. Blocks no slice. The step in which you check a live model
  on a preview has no written command. The preview API check sends JSON only, and a photo needs a
  multipart send. This item gates no slice.
- **replay extent.** Milestone: no deploy. Blocks no slice. Whether a replay stops at the model's
  first action or runs the whole turn against stubs. The requirement is "one model turn", and a mark
  points at one model call.
- **different action rule.** Milestone: no deploy. Blocks no slice. What counts as a different
  action in a replay's report. The requirement gives 3 cases that always show: another tool, another
  destination, and a reply in place of a call. The replay design states the full rule.
- **mark outside span.** Milestone: no deploy. Blocks no slice. What nixie does with a mark when a
  change of a span's edge puts the deciding turn outside the span: it refuses the change, or it
  drops the mark and tells you. The replay design picks one.
- **preview order.** Milestone 4. Blocks slice 6. When the moment view reads the removal preview and
  where it shows the 2 counts. The settled rules: the control sits behind a preview, and a failed
  preview read hides the control.
- **removal control tests.** Milestone 4. Blocks slice 6. The tests of the removal control and of
  its preview read. The intended tests are in slice 6.
- **removal sentence.** Milestone 4. Blocks slice 5. The moment view's full sentence for a removed
  record. The intended content: the word "removed", in the form of the built gap sentence.
- **parked rollback.** Milestone: no deploy. Blocks no slice. A moment across threads, replay checks
  and a reason link each write a record or a file field that the release before does not read: a
  moment record with several spans, the record kinds of the mark and of the replay result, a replay
  host command, and a rules file with a link. No design states what the release before, or a
  rollback to it, does with each. Each design settles it.

## Known faults

- **task moment tools.** Milestone 1. Blocks no slice. The source sheet holds 3 statements about a
  task that holds the moment write tools: 2 call it an open choice, and the third calls it decided.
  Decision record 0051 accepts the moment write tools at a task start. The docs follow decision
  record 0051, and [memory tools on a task](../memory-task-tools.md) owns the rule.
- **span worker records.** Milestone: no deploy. Blocks no slice. The moments design holds the
  sentence that a span covers "the records of the workers the thread started". The code reads a span
  by the moment's one thread, so a record on another thread is never part of a span. The docs follow
  the code.
- **redaction listed as not built.** Milestone 4. Blocks no slice. The moments design lists
  redaction as an extension that is not built. The forget of one message removes one message or
  reply, and a moment shows it as a gap. The docs follow the code, and slice 5 corrects the design's
  sentence.
- **cleanup task set.** Milestone 1. Blocks slice 1.
  [A forget and a task's session](../forget-and-task-sessions.md) has the cleanup read the open
  started tasks, each with `setup: TaskSetup | null`, and read `memory: 'read'` from the setup. The
  tasks sketch has `TaskSetup` as a union of 3 kinds that is never null, and its `started` member
  has no `memory` key. [The task of a definition](../definition-tasks.md) has the cleanup cover
  every task that `readDefinitionTaskIDs` returns, and the forget doc names no definition's task.
  Each doc states its own rule.
