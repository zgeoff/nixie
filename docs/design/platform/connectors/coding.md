# Running code and coding sessions

- Decisions: [0003](../../../decisions/0003-sdk-placement.md)

nixie runs code for general work, such as processing a file or crunching data, through its code tool
in an imp with no credential grants. nixie is not a coding agent: it steers coding agents through a
coding adapter, with atc first and a built-in adapter that runs one session in an imp later.

## The code tool

The code tool takes a program, its language and the files it reads, and returns the exit code, the
output and the files the program wrote. It declares the `code_run` effect, and its result is outside
content. Every code run, from the conversation, a task or a worker, gets a fresh imp from the code
image, with egress `none`, no grants and no tool route, destroyed when the call returns. The tool
runs on the host, so the decision point decides every code run and the record holds it.

A code run has fixed limits: 60 s of wall time, 512 MiB of memory, 1 MiB of output per stream, 20
MiB of files out and 1 vCPU. Input files are files an earlier code run wrote and pages the web fetch
stored. A `skills` list places each named skill's folder read-only in the sandbox, as the
[skills design](../skills.md#scripts) sets out. A program that needs outside data gets it through
another tool first, because the code imp has no route out.
[The code tool](../../../architecture/connectors/code-tool.md) holds the contracts, the limits and
what the code image holds.

## The coding adapter

A coding session is long-running work on a repo, which needs version control, package registries and
credentials. nixie defines the interface, and each adapter owns how a session runs: its sandbox,
credentials, lifecycle and agent harness. A coding runner drives one adapter, and its key is the
adapter's ID.

The interface's calls are `start`, `join`, `list`, `read`, `steer`, `message`, `stop` and `events`.
[The atc adapter](../../../architecture/connectors/coding-atc.md) holds the calls and the coding
module holds their signatures.

A session is a task, so it shows on the dashboard. nixie starts a session, or joins one you already
run, through the `coding.start` tool, which declares `coding_start`, so your rules decide both.
nixie steers a session with `coding.steer`, which types into its input as a user turn, and sends it
a note with `coding.message`, which never steers it. The spawn, each steer, each note and each stop
run as actions on the queue. The adapter's `events` feed a trigger source with a cursor, so the
session's events reach the task's thread as records.
[Coding tasks](../../../architecture/core/coding-tasks.md) covers the tools, the step and the
records.

## The atc adapter

atc runs coding sessions under its own rules, so each atc session is a supervised agent. The
`coding-atc` adapter calls atc-gateway's MCP tools over HTTP as a service client. Each atc daemon's
config grants that client the targets nixie uses. It never goes through the
[MCP proxy](mcp-proxy.md), and the model never sees atc's own tools, so your rules decide every
start, steer, note and stop. [The atc adapter](../../../architecture/connectors/coding-atc.md) holds
the map of each adapter call onto the gateway's tools.

## The built-in adapter

The built-in adapter runs a single session in an imp, with Claude Code's built-in tools inside the
imp and nixie's tools reached through the same route every imp uses. The session holds the model
credential. Any other grant, such as a git host or a package registry, comes from your rule for the
coding context, which asks once because it widens. The imp's egress allows the hosts its grants name
and the hosts your rule lists. The first build designs only this adapter's interface.
