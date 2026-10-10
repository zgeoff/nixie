# 0022: Coding and code execution

- Date: 2026-10-08
- Status: decided
- Design: [coding](../design/connectors/coding.md), [tools](../design/connectors/tools.md)
- Research: [placement spike](../../spikes/sdk-placement/),
  [imp broker spike](../../spikes/imp-broker/)

nixie is not a coding agent; it steers coding agents through adapters. It separates 2 kinds of
sandboxed work:

- **Code runs.** nixie writes and runs code for general work, such as processing a file, crunching
  data or transforming a document. A code run from the conversation or a task uses a disposable imp
  with no credential grants, and outside data reaches it through nixie's tools. Code inside a worker
  runs in the worker's own imp, which holds only the model API's grant under
  [0026](./0026-where-workers-and-the-conversation-run.md). The code environment is set by
  [0030](./0030-connectors-and-sandbox-environments.md). Code runs ship early.
- **Coding sessions.** Long-running work on a repo, which needs version control, package registries
  and credentials, runs through a coding adapter.

## The coding adapter

nixie defines the interface: start a session from a brief, report its status, pass it a message,
return its results, and stop it. A session is a task under [0018](./0018-main-thread-and-tasks.md),
so it appears on the dashboard and in the live view, and the conversation routes your messages to
it.

The adapter owns how a session runs: its sandbox, credentials, lifecycle and agent harness. nixie
owns whether a session may start, decided by your rules, the brief, supervision, and the results,
which come back as outside content.

Adapters arrive in this order:

1. **atc,** which manages many coding sessions under its own rules. nixie reaches it as an external
   server under [0017](./0017-mcp-proxy.md).
2. **A built-in adapter** that runs a single session in an imp, with Claude Code's built-in tools
   under [0003](./0003-sdk-placement.md). Its credential grants follow your risk stance for the
   coding context: no grants by default, and your rules may allow grants for that context, such as
   for a git host and a package registry. Setting such a rule is a widening, so it asks once.

## Why

- A coding session needs broad grants while it may read untrusted content, which is the hardest case
  for [0007](./0007-grants-and-taint.md). An adapter puts that case in one place, behind a risk
  stance you set, as the principle "Risk stance is set per context" requires.
- atc already manages coding sessions and their permissions, and rebuilding that inside nixie would
  duplicate it.
- A built-in adapter keeps coding possible without atc, and a code run with no grants covers
  ordinary work through nixie's tools.

## Alternatives

- **Coding work inside nixie, with grants judged per session.** A coding agent fetches what it likes
  during a session, so what it will read is not known in advance.
- **No grants for any coding session.** Every version control and registry call would become a nixie
  tool, which cripples coding agents.
- **Coding only through atc.** It leaves no route to coding without atc.
