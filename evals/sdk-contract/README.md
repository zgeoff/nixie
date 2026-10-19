# The Agent SDK contract suite

Each probe in this folder runs the Agent SDK version that `bun.lock` pins against the model, and
checks one behaviour that nixie's guests or designs rely on, so an SDK bump that changes one of them
fails the suite. The probes run Haiku 5.5 with options that mirror the guest's, in a config
directory of their own, and read the stream, the hooks and the session transcript rather than the
model's prose wherever the SDK exposes the answer.

## The probes

- `overflow`: with auto-compaction off, a turn past the context window ends in an `is_error` result
  whose `terminal_reason` is `blocking_limit` when the CLI refuses the call, or `prompt_too_long`
  when the model API does, and no other failure gives either reason. A fork at the last committed
  boundary drops the failed turn.
  [Conversation turns](../../docs/architecture/core/conversation-turns.md) detect an overflow on
  that field.
- `resume-at`: in a fork that resumes with `resumeSessionAt` and `forkSession`, the model answers
  from the boundary after a later turn and after an aborted one, and the original session keeps
  every entry. A resume at a boundary that a compaction left out fails with
  `No message found with message.uuid of:`, and a resume of a session that the config directory does
  not hold fails with `No conversation found with session ID:`, which the guest reports as
  `session_missing`. [Crash recovery](../../docs/design/platform/core/tasks.md#crash-recovery)
  resumes at the step boundary and matches that message.
- `pinned-core`: a resume with `snapshot: false` sends a changed system prompt, and a resume with
  the default snapshot keeps the recorded one, so
  [the pinned core](../../docs/design/platform/memory/context.md#the-pinned-core) sets the snapshot
  off on every query.
- `tool-list`: a resumed session with `snapshot: false` lists the tools again and sends the model a
  changed tool's new description and input schema. A session that snapshots its system prompt
  records the tool list beside it and keeps the recorded form on a resume. Inside a turn, the CLI
  keeps the tools it listed until a `notifications/tools/list_changed` makes it list them again.
  [A changed tool in a running task](../../docs/design/platform/connectors/mcp-proxy.md#a-changed-tool-in-a-running-task)
  relies on the resume, and on the snapshot staying off.
- `owner-input`: a `next` message sent during a tool call reaches the model after that call, in the
  same turn, on an assistant message stamped with the message's `uuid`. An interrupt keeps a queued
  message, which starts the next turn.
  [Messages into a running task](../../docs/design/platform/channels/client.md#messages-into-a-running-task)
  rely on both.
- `precompact-block`: a `PreCompact` hook that returns block stops an automatic compaction, which
  runs when no hook blocks it. [Compaction](../../docs/architecture/core/compaction.md) turns
  auto-compaction off instead, and the hook stays the second way to keep nixie's compactor the only
  one.
- `mod-policy`: a Claude Code mod loaded into a query denies, rewrites and answers tool calls, and a
  catch handler turns a throwing hook into a deny. The mod's command is missing from the session
  when the mod throws as it loads, and leaves it when a hook wedges the hooks worker. No nixie code
  loads a mod, and the probe keeps that option checked.

The [mods](mods/) folder holds the probe's mods. The suite copies them into its config directory
before the CLI loads them, because the CLI writes type files into each mod it loads.

## Run it

The probes read the model credential from `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`, the
variables the conversation guest reads. Inside a sandbox with a model grant, the variable holds the
grant's placeholder and the broker adds the real credential on the way out. The local login that the
memory checker eval uses does not work here, because each probe gives the CLI an empty config
directory and reads the session transcripts in it. A full run takes about 3 minutes and cost $0.47
in the SDK's estimate on SDK 0.3.290.

```bash
NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract
```

Without `NIXIE_SDK_CONTRACT=1` every probe skips, so a plain `bun test` never calls the model. With
it and neither variable set, every probe fails.

## The check on SDK bumps

The deployment repo's preview service runs the suite in a sandbox on each pull request that changes
the SDK version, and posts the result as the `sdk-contract` commit status (GEO-1119). No credential
for the suite lives in this repo or its CI.

A probe that fails on a new SDK version marks a behaviour that changed under nixie. Read the failing
assertion, find the code or design that relies on it in the table, and change that code before the
bump lands, or rewrite the probe to the new behaviour once nixie no longer depends on the old one.
