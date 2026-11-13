# The coding session runner

- **Status:** draft
- **Work items:** [the atc runner](https://linear.app/zgeoff/issue/GEO-1843),
  [typing into a coding session](https://linear.app/zgeoff/issue/GEO-945),
  [supervised sessions in the live view](https://linear.app/zgeoff/issue/GEO-311)

You ask nixie for a coding session, such as "fix the flaky login test in the shop repo". nixie
starts the session in atc, a separate program that runs coding agents, once your policy rules allow
the start. The session then shows as a task in nixie. You message it like any other task, and so
does the conversation, the task where nixie talks with you. This design adds the code that runs such
a task, the coding runner, and the coding runner's first adapter: the package `coding-atc`, whose
adapter ID is `atc`.

The coding runner calls no model of its own. Each step of a coding task, one claim of the task that
reads its new inbox records, passes the messages in the task's inbox to the session, and turns what
the session does into task messages and one report per task run. The runner plugs into
[the task runner port](https://linear.app/zgeoff/issue/GEO-2588), which is not built yet, and this
design adds fields and functions to that port's types. It also rewrites the coding adapter section
of the [coding design](../../platform/connectors/coding.md).

Three sibling designs touch this one:

- The code tool design, [code tool](../code-tool.md), owns the code tool section of the coding
  design.
- The MCP proxy build, [mcp proxy build](../mcp-proxy-build.md), leaves atc out: the proxy carries
  none of atc's tools, because this runner calls atc directly.
- The decision point cutover, [decision point cutover](../decision-point-cutover.md), builds the
  policy stages that decide each start of a coding session and each message to one.

## Terms

| Term           | Meaning                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| atc            | a separate program that runs coding sessions on targets, such as a cloud VM, under its own rules                                                    |
| principal      | a named caller that atc's config lists, with the targets it may use; nixie calls atc as one                                                         |
| reach          | the sessions a principal can see: every session on its targets, those nixie never started included                                                  |
| the hello      | the first request on a connection to atc, which carries the token and the protocol version; its reply holds atc's limits                            |
| event trail    | atc's stored list of what each session did, which a caller reads from a cursor                                                                      |
| coding task    | a task whose runner is a coding runner                                                                                                              |
| adapter        | a package that reaches one outside system for an interface that nixie owns; the coding runner calls its adapter for every atc call                  |
| turn           | one reply cycle of the coding agent inside the session, which atc reports when it ends                                                              |
| bound session  | the coding session that a coding task's start created, once the task has recorded its ID                                                            |
| coding source  | the [trigger source](../triggers.md) that reads atc's event trail into each coding task's inbox                                                     |
| report target  | the task that started a coding task, usually the conversation; it receives each report                                                              |
| variant        | one form of a tool's input, picked by a field such as `runner`, with its own policy rule name, such as `task.start/atc`                             |
| hop            | the count of task messages in one exchange; past the [hop limit](../../../architecture/core/task-messages.md#the-hop-limit) a message wakes nobody  |
| claim          | the step of the task runner that takes a task's lease before a step runs ([leases and recovery](../../../architecture/core/leases-and-recovery.md)) |
| decision point | the code that decides allow, ask or deny for each tool call, in stages ([the decision point design](../../platform/policy/decision-point.md))       |
| harness        | the model client a profile runs on, such as `agent-sdk` or `codex` ([model profiles](../../../architecture/core/model-profiles.md#harnesses))       |

[The runner](runner.md) and [the atc adapter](atc.md) use these terms too. Other terms, such as an
inbox, a task run, a projection and an imp, are in the [glossary](../../../glossary.md).

## Shape

```mermaid
flowchart LR
  conv[conversation] -->|"task.start/atc"| start[start: task.created + spawn action]
  start --> queue[action queue]
  queue -->|"session.spawn, key: action ID"| atc[atc]
  atc -->|"events.read, cursor"| source[coding source]
  source -->|"trigger.task_input"| thread[coding task's thread]
  queue -->|"outcome"| thread
  thread --> step[coding runner step]
  step -->|"coding.message action"| queue  step -->|"task_message, report"| target[report target]
```

The start writes the coding task and queues the spawn on the action queue. The spawn's outcome and
the session's events land on the task's thread. Each step then moves them on: a message to the task
goes to the session as a `coding.message` action, and the session's answers, notes and reports go
back to the report target as `task_message` records.

## Parts

| Doc                       | What it holds                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [the runner](runner.md)   | the start and its policy, the runner definition, the records, what one step does, delivery, ends and limits, `tasks.list` |
| [the atc adapter](atc.md) | `CodingAdapter`, the coding source, the map onto atc, the config and the token, the release pairs, typing                 |

## Rollback

A rollback to a release that has the runner port and lacks the coding runner takes these steps, in
order:

1. Close each coding task with the `close` control, from the dashboard or the `close`
   [task host command](../../../architecture/deployment/host-commands.md#tasks). The close calls the
   coding runner's `ended` function ([the runner](runner.md#the-runner-definition)), which stops the
   bound session in atc. Expect: each coding task lists as closed, and atc lists each of its
   sessions as exited.
2. Remove the `coding` section from the deployment config, and each policy rule that names the
   effect `coding_start` from the repo that holds your definitions. Expect: the config passes the
   schema of the release you roll back to.
3. Roll back the image. Expect: the server starts.

## Decisions

- **A coding runner runs no model.** Its step only moves records between the task and the session,
  so it spends no model money and needs no sandbox.
- **This runner's key is `atc`.** The owner chose it on 14 Nov 2026. The key names the config
  section `coding.atc` and the variants `task.start/atc` and `task.message/atc`.
- **The coding runner is generic over `CodingAdapter`, and its key is the adapter's ID.** A later
  adapter, such as a built-in one that runs a session in an [imp](../../../glossary.md), gets its
  own key and its own `task.start` variant.
- **The start and each message delivery are actions on the action queue.** The queue records each
  attempt before it calls atc, uses the action ID as the idempotency key, and marks an attempt with
  no result `unknown` and never tries it again, so a crash never spawns a second session.
- **One task run is one stretch of the session's work, from a message to the turn that leaves the
  session idle.** The report target then gets one report for each such stretch, as it gets one for
  every task run.

## Builder decides

- The choices that each part lists under its own Builder decides.

## Out of scope

- The container sandbox adapter ([GEO-308](https://linear.app/zgeoff/issue/GEO-308)).
- A limit on a session's spend or wall time. The coding agent spends on its own account in atc,
  outside nixie's [budgets](../../platform/policy/budgets.md).
- Answering a session's question or its permission menu. The design session on
  [typing](https://linear.app/zgeoff/issue/GEO-945) and the
  [approval forwarding](https://linear.app/zgeoff/issue/GEO-70) design own them.
- A coding task from a definition file. The
  [task definitions work](https://linear.app/zgeoff/issue/GEO-1330) adds a `runner` key to the
  definition format.

## Open questions

- **Does each model API accept a `oneOf` under an object root for the `task.start` input?** One
  probe per harness settles it, for `agent-sdk` and `codex`: the conversation's model calls
  `task.start` with both variants in the tool's input schema, and the probe checks that the API
  takes the schema and the call parses. Until the probe passes on a harness, the server leaves the
  coding variant out of `task.start` on that harness.
- **When does a line that nixie types into a session carry your authority?** A design session with
  the owner, held after the approval forwarding design, settles it, with questions 2 to 11 of
  [GEO-945](https://linear.app/zgeoff/issue/GEO-945). The owner answered that issue's question 1:
  the design session takes place. Until then, nixie types nothing into a session.
