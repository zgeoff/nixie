# The Agent SDK contract suite

Each probe in this folder runs the Agent SDK version that `bun.lock` pins against the model, and
checks one behaviour that nixie's guests or designs rely on. A pull request that changes the SDK
version runs the suite, so a bump fails until every probe passes on the new version. The probes run
Haiku 5.5 with options that mirror the guest's, in a config directory of their own, and read the
stream, the hooks and the session transcript rather than the model's prose wherever the SDK exposes
the answer.

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
  `No message found with message.uuid of:`.
  [Crash recovery](../../docs/design/platform/core/tasks.md#crash-recovery) resumes at the step
  boundary and matches that message.
- `pinned-core`: a resume with `snapshot: false` sends a changed system prompt, and a resume with
  the default snapshot keeps the recorded one, so
  [the pinned core](../../docs/design/platform/memory/context.md#the-pinned-core) sets the snapshot
  off on every query.
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

The probes sign in with a Claude Code OAuth token from `claude setup-token`, read from
`CLAUDE_CODE_OAUTH_TOKEN`. The local login that the memory checker eval uses does not work here,
because each probe gives the CLI an empty config directory and reads the session transcripts in it.
Inside a sandbox whose broker adds the model credential, any placeholder token works. A full run
takes about 3 minutes and cost $0.47 in the SDK's estimate on SDK 0.3.290.

```bash
NIXIE_SDK_CONTRACT=1 CLAUDE_CODE_OAUTH_TOKEN=<oauth_token> bun test evals/sdk-contract
```

Without `NIXIE_SDK_CONTRACT=1` every probe skips, so a plain `bun test` never calls the model. With
it and no token, every probe fails.

## The gate in CI

The [SDK contract workflow](../../.github/workflows/sdk-contract.yml) compares the SDK packages that
`bun.lock` resolves on the pull request and on its base. When they differ, or when the suite or the
workflow changed, it runs the suite with the `CLAUDE_CODE_OAUTH_TOKEN` repository secret, and a
failed probe fails the check. Every other pull request passes the check without a model call.

A probe that fails on a new SDK version marks a behaviour that changed under nixie. Read the failing
assertion, find the code or design that relies on it in the table, and change that code before the
bump lands, or rewrite the probe to the new behaviour once nixie no longer depends on the old one.
