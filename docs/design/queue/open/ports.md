# Port rules and design sessions: what is not settled

This list holds every item that [port rules](../port-rules.md) and the session docs mark as
`(open: <name>)`. The session docs are [design sessions to run](../design-sessions-to-run.md),
[the voice call session](../voice-session.md), [the voice inputs](../voice-session-inputs.md),
[the voice questions](../voice-session-questions.md), [the typing session](../typing-session.md) and
[the typing inputs](../typing-session-inputs.md). [The terms](../design-sessions-to-run.md#terms)
define the words used here, such as the agent, atc, the harness boundary, H1, T1 and "intended".
"The design work" is the first design pass of the queue, which these docs condense. A rule number is
a rule of port rules.

The tracker issues of the 2 design sessions are
[the voice call issue](https://linear.app/zgeoff/issue/GEO-1867) and
[the typing issue](https://linear.app/zgeoff/issue/GEO-945). The port rules have no issue.

Two facts in the typing inputs come from records in the tracker, and the repo's docs lack them:

- Your approval of a pull request goes on record through a command and a check. The source is
  decisions 10 and 11 of [this design record](https://linear.app/zgeoff/issue/GEO-1680).
- The atc runner calls atc's API as a listed principal. The source is decisions 9 and 10 of
  [this slice plan record](https://linear.app/zgeoff/issue/GEO-1690). The tracker issue of the atc
  runner is [this one](https://linear.app/zgeoff/issue/GEO-1843).

The questions that you answer inside a design session are in the session docs, and this list does
not repeat them.

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 1: waiting designs; barge-in reservation; provider facts; resumed turn wait; unknown role
  key.
- Slice 2: typing session fate; atc principal.

## Not decided

Each item waits for your decision.

- **waiting designs.** Milestone: no deploy. Blocks slice 1. The port rules build on 6 designs of
  other parts of the queue design, and you have not decided any of the 6. The port rules use the
  intended option of each. If you pick another option for one, the agent rewrites the examples of
  rules 1, 2, 11 and 12 and the "Not in scope" list of the port rules. Each row is an item of its
  owner's list: "boundary design", "definition home", "request change place" and "capture and store"
  in [the harnesses list](harnesses.md#not-decided), "hop scan place" in
  [the web list](web.md#not-decided) and "hold design" in
  [the operations list](operations.md#not-decided).

  | Design                                              | Intended option                                   | Issue                                                          |
  | --------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
  | The harness boundary                                | One definition file per harness, one host encoder | [the Codex harness](https://linear.app/zgeoff/issue/GEO-2237)  |
  | Where the host-side definition of a harness lives   | In the models module                              | [the Codex harness](https://linear.app/zgeoff/issue/GEO-2237)  |
  | The rewrite of a request for a model outside Claude | In the conversation guest                         | [OpenRouter tasks](https://linear.app/zgeoff/issue/GEO-2234)   |
  | Where the turn-input log captures a request         | At the counting proxy                             | [the turn-input log](https://linear.app/zgeoff/issue/GEO-2355) |
  | Where the scan of a redirect's URL happens          | On the host, with `makeHopScan` as the one policy | [secret URLs](https://linear.app/zgeoff/issue/GEO-2246)        |
  | The recovery hold                                   | A refusal inside `claimLease`, for every claim    | [recovery](https://linear.app/zgeoff/issue/GEO-1816)           |

  Two notes on the table. In row 2, the intended option departs from rule 1, which gives the type to
  its caller, the sessions module. The design work accepts the departure because of the guest part
  of rule 2. In row 4, the intended option has 2 more parts: nixie stores each request outside the
  database, and it stores no body for a request that holds a secret.

- **poll source home.** Milestone: no deploy. Blocks no slice. Where a poll source of a trigger
  lives ([the poll sources issue](https://linear.app/zgeoff/issue/GEO-1827)). Option 1: an adapter
  package `trigger-<system>`. Option 2: a source in the triggers module that makes its call through
  a connector. The design work prefers neither. Rule 2 gives no place for a poll source until you
  pick, so pick before a builder starts the first poll source.
- **runner limits.** Milestone: no deploy. Blocks no slice. A `task.start` call can set a limit,
  such as a dollar limit, on a task whose runner cannot count that limit. The task runner port has
  no list of the limits that a runner counts, so nixie accepts the call
  ([the runner port issue](https://linear.app/zgeoff/issue/GEO-1793)). Rule 8 covers only what a
  config file asks for. Option 1: a runner declares the limits that it counts, and nixie rejects a
  start with any other limit. Option 2: rule 8 states that a start's limits are outside it. The
  design work prefers neither.
- **typing session fate.** Milestone: no deploy. Blocks slice 2. Question T1 of
  [the typing session](../typing-session.md): close the typing issue, leave it open and run the
  typing session, or run one design session for the typed line and
  [the approval forwarding design](https://linear.app/zgeoff/issue/GEO-70). Intended: close.
- **barge-in reservation.** Milestone: no deploy. Blocks slice 1. The voice session covers barge-in
  and echo with a reservation of yours. The content of the reservation is not on record. State what
  it excludes before question H4 of the voice session.

## Not checked

The agent does each check. The first, third and fourth are part of slice 1, and the second is part
of slice 2.

- **provider facts.** Milestone: no deploy. Blocks slice 1. The repo does not hold 11 facts about
  the speech provider: the 9 under "What the agent verifies in the provider's docs" in the voice
  inputs, the price and the retention terms. The agent reads the speech provider's docs and puts
  each fact, with its link, in the pull request of the voice session. If the docs lack a fact, the
  agent tells you, and you decide the questions that depend on it without the fact.
- **atc principal.** Milestone: no deploy. Blocks slice 2. Whether a principal that atc lists can
  call atc's `session.submit` and `session.choose`. The agent reads atc's docs at atc's main branch.
  If a principal can call both, option 1 of T3 needs no change to atc. If it cannot, option 1 of T3
  needs a change to atc, with an issue in the atc repo.
- **resumed turn wait.** Milestone: no deploy. Blocks slice 1. Check 1 of
  [the voice call session](../voice-session.md), which gives the command. The agent measures the
  median time to the first text of a resumed turn, on the model for calls. If the median is inside
  the wait that you accept in the voice session, option A of H1 holds. If it is outside, you choose
  between option B, another model and a longer wait.
- **unknown role key.** Milestone: no deploy. Blocks slice 1. Check 2 of the voice call session. The
  agent writes a case in `models-config-schema.test.ts` with one unknown key under `roles`. The
  build issue that adds a model role for calls records the result. If the load fails, a rollback to
  the release without the role first removes the key from the config file. If the load passes, the
  release without the role ignores the key.

## Not written

Each item is a piece that a builder or a designer must supply.

- **trigger fake.** Milestone 3. Blocks no slice. The trigger source has no designed fake
  ([the schedules issue](https://linear.app/zgeoff/issue/GEO-1835)). Rule 6 puts a fake with its
  interface, so the intended place of a fake source is the triggers module.
- **sandbox contract suite.** Milestone: no deploy. Blocks no slice. Rule 13 asks for a shared
  contract suite on a port with 2 real providers. The design work also includes a suite for the
  sandbox adapter, against the imp adapter and the process sandbox. That suite is in no slice of the
  queue design, and it has no date.
- "harness ID lists" is filed once, as "harness ID lists test" and "release pairs table" in
  [the harnesses list](harnesses.md#not-written).
- **code layout doc.** Milestone: no deploy. Blocks no slice. Under the code layout doc, in the
  architecture docs, an adapter implements one of the 6 interfaces of decision 0016, and its list of
  adapters omits `definitions-github`. The edit that brings it in line with rule 2 has 3 parts: an
  adapter implements "an interface a module owns"; the list has `definitions-github`; one sentence
  covers a guest-side provider. The edit is in no slice.
- **onnx zone.** Milestone: no deploy. Blocks no slice. Rule 5 asks for an import zone for each
  outside client. The ONNX runtime is a dependency of the `encoder-onnx` adapter alone, and the lint
  rule has no zone for the runtime. The zone is in no slice.
- **agent-sdk in a config error.** Milestone: no deploy. Blocks no slice. Rule 9 forbids a branch on
  a provider's name outside the composition root. One error message of the models config schema has
  the harness ID `agent-sdk` written in it, and the design work counts that as a departure from
  rule 9. The change of that message is in no slice.
- **rule reasons.** Milestone: no deploy. Blocks no slice. The design work gives a reason for only 2
  parts of the rules: the guest part of rule 2, and the composition root's exception in rule 9. The
  agent that wrote port rules wrote every other "Reason" sentence from decision 0016 and the code
  layout doc. You confirm or replace each one.

## Known faults

Each item is a conflict between 2 sources, with the one that these docs follow.

- **release pair rule.** Milestone: no deploy. Blocks no slice. The design work's list of port rules
  has rule 12: a design gives a table of release pairs. The same design work, in its order of work,
  has "what each pair of releases does" as a question without an answer. The port rules follow the
  first and state rule 12 as a rule. You confirm rule 12 or withdraw it.
- **harness record in an issue.** Milestone 4. Blocks no slice.
  [The Codex harness issue](https://linear.app/zgeoff/issue/GEO-2237) quotes a `HarnessDescriptor`
  with `configSchema` and `toProfile`. The type in the code has neither, and the profile schema is
  in a file of its own in the models module. The docs follow the code.
- **heard reply figure.** Milestone: no deploy. Blocks no slice. The voice inputs give the reply
  that you interrupt as 8 to 16 s long, from the design work. The results doc of the voice-latency
  spike gives 12 to 21 s, for a reply of the spike's Agent SDK pipeline and not of GPT-Live. The
  voice inputs follow the design work. The agent finds the figure for GPT-Live in the spike's reply
  report before the voice session.
- **boundary value.** Milestone: no deploy. Blocks no slice. Rule 8 has nixie check what a provider
  declares. The sandbox adapter declares a `boundary` value, and the code never checks or reads it.
  The port rules state rule 8 without an exception, and list the unread value as a departure. The
  design work does not say whether the value needs a check.
