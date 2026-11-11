# The open list

This list holds every item of the queue design that is not settled and that blocks a build. Each
family of docs has a file in `open/` with all of its items, under 4 kinds. "Not decided" is a choice
that waits for you. "Not checked" is a fact that the design assumes and nobody ran. "Not written" is
a missing piece that a builder supplies, such as an error text. "Known faults" is a contradiction
between 2 statements. A doc or a sketch marks the place of an item as `(open: <name>)`, and the name
is the bold text of the item in its family's file. Each item there starts with its milestone and the
slices that it blocks. An item blocks when a slice cannot be built or checked until the item is
settled. "(yours)" after a name marks a "Not decided" item: you decide it.

## Blocks a build

### Milestone 1

33 items block a build, and 11 of them are yours.

- [review screen word](open/memory-gate.md#not-decided) (yours): Does the web review screen show the
  word "note-taker" for a record that the note-taker wrote?
- [unsupported lines](open/sandboxes.md#not-decided) (yours): How many warn lines does an adapter
  that returns `unsupported` give?
- [proposal short id](open/web.md#not-decided) (yours): Where does a proposal's short ID come from?
- [check location](open/operations.md#not-decided) (yours): Where does the rollback check take
  place?
- [rollback target source](open/operations.md#not-decided) (yours): How does the rollback check
  learn the last release that a deployment ran?
- [check log](open/operations.md#not-decided) (yours): How is the log of the release to deploy made
  for the rollback check?
- [check pass](open/operations.md#not-decided) (yours): What counts as a pass of the rollback check?
- [expected results](open/operations.md#not-decided) (yours): Where does the expected result for
  each record kind, migration and config key live?
- [check blocks](open/operations.md#not-decided) (yours): Does a failed rollback check block the
  release, or only the milestone deploy?
- [further back](open/operations.md#not-decided) (yours): Does the rollback check cover a release
  further back than the rollback target?
- [status procedures](open/operations.md#not-decided) (yours): Do `memory/writerStatus` and
  `memory/consolidatorStatus` go with the delete of the 2 built-in memory tasks? Intended: both
  exist, deprecated, and each returns `isEnabled: false`.
- [recall probes](open/memory-index.md#not-checked): Do the 4 probes of the Agent SDK's program
  confirm the page limit and the oversized-item rule?
- [page limit name](open/memory-index.md#not-written): What is the name of the page limit constant?
  Intended: the pull request of slice 1 picks it.
- [recall request names](open/memory-index.md#not-written): What are the names of the 2 members that
  the recall tool gives the store?
- [fixture round trip](open/memory-gate.md#not-checked): Does a committed log fixture with sealed
  records and their keys load and rebuild every projection?
- [stored prompt fixture](open/memory-gate.md#not-checked): Can the built code write the stored
  approval and the definitions in force of the second fixture?
- [last release off step](open/memory-gate.md#not-checked): Does the last release a deployment ran
  hold both `enabled` keys and the off step?
- [change rows](open/memory-gate.md#not-checked): Are the rows of `memory_consolidation_changes` the
  same after the delete as ahead of it?
- [start refusal text](open/memory-gate.md#not-written): What reason and sentence does a refused
  start get in the 2 cases of a memory write tool? Intended: the built reasons `memory_tools` and
  `wider_tools`.
- [deleted prompt refusal](open/memory-gate.md#not-written): What sentence refuses the approval of a
  prompt proposal for `writer` or `consolidator`? Intended: it states that the prompt is deleted,
  and nixie writes nothing.
- [neutral event lines](open/memory-gate.md#not-written): What is the exact text of the 4 event
  lines for the origin `memory_writer`? Intended: neutral words, such as "a proposal".
- [stored event kinds](open/memory-gate.md#known-faults): Are the event kinds of the catch-up and of
  the self-note flag removed, or rendered in neutral words? Intended: rendered, and no code writes a
  record for either.
- [count across sleep](open/sandboxes.md#not-checked): Does a sleeping sandbox hold its count of
  memory kills?
- [installed cli path](open/sandboxes.md#not-checked): How does the Agent SDK lane's start hook find
  the installed CLI's path?
- [kills field](open/sandboxes.md#not-written): Is `kills` on a `sandbox.memory_kill` line the
  guest's count or the rise since the last read? Intended: the count.
- [baseline line](open/sandboxes.md#known-faults): Which `ended` value does a `no_baseline` line
  hold, when no guest program has ended?
- [stored uuid readers](open/web.md#not-checked): Does server code read a UUID out of a stored
  `result`?
- [stored uuid rule](open/web.md#known-faults): What does `log.read` show for a UUID in a stored
  record? Intended: the short ID, read from the row, and the key omitted when the row gives none.
- [previous bundle](open/operations.md#not-checked): Can a test lane build and start a previous
  release's server bundle on this build's data directory?
- [forget cause](open/moments.md#not-checked): Is a forgotten reply in the session of an open task
  that reads no memory?
- [ended task sandbox](open/moments.md#not-checked): Does the sandbox of an ended task hold a
  transcript with a forgotten record?
- [pick signature](open/moments.md#not-written): How does `pickCleanedTaskIDs` receive the record's
  thread? Intended: as a second argument, `null` for the other 2 causes.
- [cleanup task set](open/moments.md#known-faults): Which tasks does a forget's session cleanup
  read, and what does `TaskSetup` hold for them?

### Milestone 2

18 items block a build, and 3 of them are yours.

- [fold order](open/memory-index.md#not-decided) (yours): What does `index_fold_order: oldest-first`
  order by?
- [index details](open/memory-index.md#not-decided) (yours): Is the memory index issue the source
  for the block's format, orders, closing line and defaults? Intended: the docs follow the issue.
- [labels reason readers](open/memory-index.md#not-decided) (yours): Do the API's `reason` list and
  the web client's label take the review reason `labels`?
- [path table](open/memory-index.md#not-checked): Do the 2 lists of the revision doc name every
  reader of an item's version?
- [last release](open/memory-index.md#not-checked): Does the last release a deployment ran skip an
  unknown record kind and read the schema of slice 2?
- [dropped column](open/memory-index.md#not-checked): What does the migration check do with a
  dropped column?
- [zero limit search](open/memory-index.md#not-checked): Does a turn's search with a limit of 0
  return no item and append no record?
- [rejected ask](open/memory-index.md#not-checked): What does the step runner do when the ask for a
  turn's memory rejects?
- [trigger floor](open/memory-index.md#not-written): What is the default of `trigger_min_score`?
  Intended: a high floor, set as a tuning value in the pull request of slice 6.
- [index status lines](open/memory-index.md#not-written): What is the wording of the 2 status lines
  of the index?
- [index opening line](open/memory-index.md#not-written): What is the wording of the first line of
  the index block?
- [smallest budget](open/memory-index.md#not-written): What does the index hold when `index_tokens`
  is under its first line, headings and closing line together?
- [empty recall text](open/memory-index.md#not-written): What is the tool's text for a recall that
  finds nothing? Intended: it states that the tool searched and found nothing.
- [error texts](open/memory-index.md#not-written): What is the wording of the 6 tool errors?
- [session index fields](open/memory-index.md#not-written): What are the field names of
  `SessionIndex`?
- [trigger match shape](open/memory-index.md#not-written): What is the match type that `readMatches`
  of `TriggerIndex` returns?
- [sensitive reason tests](open/memory-index.md#not-written): Which tests cover the review reason
  `sensitive` when no write gets it? Intended: the tests in slice 3.
- [labels web text](open/memory-gate.md#not-written): What is the web review screen's sentence for
  the reason `labels`?

### Milestone 3

49 items block a build, and 11 of them are yours. They are in
[the milestone 3 list](open-milestone-3.md).

### Milestone 4

92 items block a build, and 49 of them are yours. They are in
[the milestone 4 list](open-milestone-4.md).

### No deploy

18 items block a build, and 10 of them are yours. These items block work that ships nothing to a
deployment.

- [eval park](open/memory-gate.md#not-decided) (yours): Is the eval designed, or parked until a task
  runner exists? Intended: park it.
- [image session](open/sandboxes.md#not-decided) (yours): Which base, fetcher binary, Chromium and
  size budget do the tool images take? Intended: per image, as the 4 answers of the item give.
- [fetch base issue](open/sandboxes.md#not-decided) (yours): Which issue covers the digest pin of
  the fetch image's 2 `FROM` lines? Intended: one follow-up of the image session.
- [ordering argument](open/sandboxes.md#not-decided) (yours): What form does the Kubernetes
  component's ordering argument take, when the `dependsOn` check fails?
- [reopen moment definition](open/moments.md#not-decided) (yours): Is decision record 0037 reopened,
  so that a moment can hold several threads? Intended: no, until a kept moment shows the need.
- [turn-input log choices](open/moments.md#not-decided) (yours): Which answers do the 6 open choices
  of the turn-input log get, for the replay design to build on?
- [rule link need](open/moments.md#not-decided) (yours): Does a rule need a link beside its `note`?
  Intended: no link.
- [waiting designs](open/ports.md#not-decided) (yours): Which option does each of the 6 designs
  under the port rules take? Intended: the intended option of each.
- [typing session fate](open/ports.md#not-decided) (yours): Is the typing issue closed, or does a
  typing session take place? Intended: close it.
- [barge-in reservation](open/ports.md#not-decided) (yours): What does your reservation on barge-in
  and echo exclude?
- [dependsOn check](open/sandboxes.md#not-checked): Does Pulumi pass a component's `dependsOn` down
  to its children?
- [test API actions](open/operations.md#not-checked): Does the test API read back an action that the
  actions module made?
- [identities writer](open/operations.md#not-checked): Does one module alone write `identities`?
- [lint config version](open/operations.md#not-written): Which version of `@zgeoff/oxlint-config`
  does the bump take? Intended: the first release that holds the fix to `seed-only`.
- [provider facts](open/ports.md#not-checked): What do the speech provider's docs state for the 11
  facts that the repo lacks?
- [atc principal](open/ports.md#not-checked): Can a principal that atc lists call atc's
  `session.submit` and `session.choose`?
- [resumed turn wait](open/ports.md#not-checked): What is the median time to the first text of a
  resumed turn, on the model for calls?
- [unknown role key](open/ports.md#not-checked): Does the config load with one unknown key under
  `roles`?

### No milestone

6 items block a build, and 2 of them are yours. The image set has no milestone: see "image set
issue".

- [image set issue](open/sandboxes.md#not-decided) (yours): Does the image set get an issue and a
  milestone of its own?
- [size rows order](open/sandboxes.md#not-decided) (yours): Which lands first: the harness record or
  the image set?
- [size refusal text](open/sandboxes.md#not-written): What sentence does `buildSandboxSizes` throw
  for an override that is odd or under 128? Intended: it holds the row's name.
- [manifest refusal text](open/sandboxes.md#not-written): What are the 2 sentences that
  `buildSandboxManifest` throws? Intended: one holds a key of the tuple with no ref, and one holds a
  ref with no key.
- [several missing images](open/sandboxes.md#not-written): What is the start's refusal text for 2 or
  more missing images? Intended: it holds each image and what needs it.
- [null size row](open/sandboxes.md#known-faults): What does `getHarnessSize` return for a null row
  of `sizeRows`?

## By family

- [Tasks](open/tasks.md): 6 not decided, 10 not checked, 12 not written, 10 known faults.
- [Task definitions](open/definitions.md): 9 not decided, 5 not checked, 12 not written, 5 known
  faults.
- [Memory index](open/memory-index.md): 4 not decided, 8 not checked, 11 not written, 3 known
  faults.
- [Memory gate](open/memory-gate.md): 7 not decided, 5 not checked, 5 not written, 4 known faults.
- [Sandboxes](open/sandboxes.md): 7 not decided, 8 not checked, 5 not written, 4 known faults.
- [Web](open/web.md): 13 not decided, 6 not checked, 7 not written, 3 known faults.
- [Operations](open/operations.md): 27 not decided, 9 not checked, 6 not written, 6 known faults.
- [Harnesses](open/harnesses.md): 16 not decided, 12 not checked, 9 not written, 3 known faults.
- [Moments](open/moments.md): 22 not decided, 2 not checked, 10 not written, 4 known faults.
- [Port rules and design sessions](open/ports.md): 5 not decided, 4 not checked, 6 not written, 4
  known faults.
