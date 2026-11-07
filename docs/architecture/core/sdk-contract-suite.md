# The Agent SDK contract suite

Each probe in [`evals/sdk-contract/`](../../../evals/sdk-contract/) runs the Agent SDK version that
`bun.lock` pins against the model, and checks one behaviour that nixie's guests or designs rely on,
so an SDK bump that changes one of them fails the suite. The probes run Haiku 5.5 with options that
mirror the guest's, in a config directory of their own, and read the stream, the hooks and the
session transcript rather than the model's prose wherever the SDK exposes the answer.

Each probe is a function in the conversation guest's
[sdk-contract](../../../guests/conversation/src/sdk-contract/) folder. This suite runs it against
the model, and the guest's Agent SDK tests run it against a stub model on every pull request. Only
this suite runs `model-grant`, because only the real broker replaces the placeholder credential, and
the `mod-policy` case where a hook wedges the hooks worker, because the case waits for the CLI's
watchdog to fire.

## The probes

- `overflow`: with auto-compaction off, a turn past the context window ends in an `is_error` result
  whose `terminal_reason` is `blocking_limit` when the CLI refuses the call, or `prompt_too_long`
  when the model API does, and no other failure gives either reason. A fork at the last committed
  boundary drops the failed turn. [Conversation turns](conversation-turns.md) detect an overflow on
  that field.
- `resume-at`: in a fork that resumes with `resumeSessionAt` and `forkSession`, the model answers
  from the boundary after a later turn and after an aborted one, and the original session keeps
  every entry. A resume at a boundary that a compaction left out fails with
  `No message found with message.uuid of:`, and a resume of a session that the config directory does
  not hold fails with `No conversation found with session ID:`, which the guest reports as
  `session_missing`. [Crash recovery](../../design/platform/core/tasks.md#crash-recovery) resumes at
  the step boundary and matches that message.
- `pinned-core`: a resume with `snapshot: false` sends a changed system prompt, and a resume with
  the default snapshot keeps the recorded one, so
  [the pinned core](../../design/platform/memory/context.md#the-pinned-core) sets the snapshot off
  on every query.
- `tool-list`: a resumed session with `snapshot: false` lists the tools again and sends the model a
  changed tool's new description and input schema. A session that snapshots its system prompt
  records the tool list beside it and keeps the recorded form on a resume. Inside a turn, the CLI
  keeps the tools it listed until a `notifications/tools/list_changed` makes it list them again.
  [A changed tool in a running task](../../design/platform/connectors/mcp-proxy.md#a-changed-tool-in-a-running-task)
  relies on the resume, and on the snapshot staying off.
- `owner-input`: a `next` message sent during a tool call reaches the model after that call, in the
  same turn, on an assistant message stamped with the message's `uuid`. An interrupt keeps a queued
  message, which starts the next turn.
  [Messages into a running task](../../design/platform/channels/client.md#messages-into-a-running-task)
  rely on both.
- `precompact-block`: a `PreCompact` hook that returns block stops an automatic compaction, which
  runs when no hook blocks it. [Compaction](compaction.md) turns auto-compaction off instead, and
  the hook stays the second way to keep nixie's compactor the only one.
- `tool-output`: under the CLI's defaults, a tool result past its tool-output limit reaches the
  model as a pointer to a saved file. With the limit and the large output files that the
  conversation guest sets, a web fetch result at the default text limit reaches the model whole, and
  a longer result reaches it cut and inline. [Web fetch](../connectors/web-fetch.md) keeps its text
  limit under that limit. A result's image block reaches the model beside its text block.
- `mod-policy`: a Claude Code mod loaded into a query denies, rewrites and answers tool calls, and a
  catch handler turns a throwing hook into a deny. The mod's command is missing from the session
  when the mod throws as it loads, and leaves it when a hook wedges the hooks worker. No nixie code
  loads a mod, and the probe keeps that option checked. Its mods live in the guest's
  [mods](../../../guests/conversation/src/sdk-contract/mods/) folder.
- `model-grant`: a turn whose only credential is the placeholder that `buildModelGrant` sets, in
  either auth header's variable, gets its answer through the broker, because the broker replaces the
  header on each request it carries. [Model profiles](model-profiles.md) give each model loop that
  grant.

## Run it

The [SDK contract suite runbook](../../runbooks/sdk-contract-suite.md) gives where the suite runs,
the steps to run it by hand on each Agent SDK bump, and what to do when a probe fails. The
deployment repo's preview service also runs the suite on each pull request that changes the SDK
version, and posts the result as the `sdk-contract` commit status.
