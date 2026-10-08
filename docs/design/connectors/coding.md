# Running code and coding sessions

- Status: Proposed
- Decisions: [0007](../../decisions/0007-grants-and-taint.md),
  [0017](../../decisions/0017-mcp-proxy.md), [0018](../../decisions/0018-main-thread-and-tasks.md),
  [0022](../../decisions/0022-coding-and-code-execution.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

nixie runs code for general work, such as processing a file or crunching data, through its code
tool, in an imp with no credential grants. It is not a coding agent; it steers coding agents through
a coding agent adapter, with atc first and a built-in adapter that runs one session in an imp later,
under [0022](../../decisions/0022-coding-and-code-execution.md). Everything in this doc beyond the
decisions it links is a proposal.

## The code tool

The code tool takes a program, its language, and the files it reads, and returns the exit code, the
output and the files the program wrote. It declares the `run_code` effect from the
[decision point](../policy/decision-point.md#effects), and its result is outside content. It comes
early, under 0022.

Where the code runs depends on the caller:

- **From the conversation or a task,** nixie creates a fresh imp from the code image with egress
  `none` and no grants, runs the program, and destroys the imp when the call returns, as 0022
  requires.
- **From a worker,** the program runs inside the worker's own imp, where the worker's model loop
  runs, under [0026](../../decisions/0026-where-workers-and-the-conversation-run.md). The worker imp
  is disposable and serves one tool call, so a second imp would add a start-up and isolate nothing
  the worker does not hold already. That imp holds the model credential as its one grant, so code
  there can reach the model API's host and nothing else.

The tool still runs on the host in both cases: the model calls it through nixie's tools, the policy
decision point decides it, and the [sandbox adapter](./sandbox-adapter.md#running-a-command) runs
the program with `exec`. **Why:** a code run that went around the tool would escape the record, and
the decision point is the one place that limits how much code a run executes.

A run has these limits by default, and the owner can change each per job:

| Limit     | Default |
| --------- | ------- |
| Wall time | 60 s    |
| Memory    | 1 GiB   |
| Output    | 1 MiB   |
| Files out | 20 MiB  |
| vCPUs     | 1       |

Input files come from nixie's own store, such as an attachment in the conversation or a file a
connector fetched, and the tool copies them into the imp before the run. Output files come back
under the paths the call names, and nixie stores them as outside content. A program that needs data
from outside gets it through another nixie tool first, because the code imp has no route out, under
[0007](../../decisions/0007-grants-and-taint.md).

## The coding agent adapter

A coding session is long-running work on a repo, which needs version control, package registries and
credentials. nixie defines the interface, and each adapter owns how a session runs: its sandbox,
credentials, lifecycle and agent harness, under 0022. The shape below is a sketch in TypeScript.

```ts
interface CodingAdapter {
  id: string; // such as 'atc'
  start(brief: SessionBrief, key: string): Promise<SessionRef>;
  status(session: SessionRef): Promise<SessionStatus>;
  message(session: SessionRef, text: string, key: string): Promise<MessageRef>;
  results(session: SessionRef): Promise<SessionResult[]>;
  stop(session: SessionRef): Promise<void>;
  events(cursor: string | null): AsyncIterable<SessionEvent>; // for the trigger source
}

interface SessionBrief {
  repo: { url: string; ref: string };
  prompt: string;
  agent?: string;
  model?: string;
}
```

A session is a task under [0018](../../decisions/0018-main-thread-and-tasks.md), so it appears on
the task board and in the live view, and the conversation routes the owner's messages to it. nixie
owns whether a session may start: starting one and messaging one are nixie tools with declared
effects, which the owner's rules decide. The adapter's `events` feed a trigger source with a cursor,
so a session's progress reaches its task's inbox as records, and its results come back as outside
content.

`start` and `message` take the action ID as a key, and run as outside actions on the queue, because
each one changes something outside nixie. An adapter that honours the key lets the queue retry an
unknown outcome under it.

## The atc adapter

atc manages many coding sessions under its own rules, and nixie reaches it as an outside MCP server
through the [MCP proxy](./mcp-proxy.md), under 0022. The proxy arrives with the first outside server
under [0017](../../decisions/0017-mcp-proxy.md), so it arrives with the atc adapter.

The atc adapter maps the interface onto atc's MCP tools, which the proxy pins by hash with effects
the owner declares:

| Adapter call | atc tool              | Notes                                                    |
| ------------ | --------------------- | -------------------------------------------------------- |
| `start`      | `atc_session_spawn`   | Takes an idempotency key; a workspace from a git ref     |
| `message`    | `atc_session_message` | Takes an idempotency key; the reply comes back as events |
| `status`     | `atc_session_get`     | State, the question it waits on, its last answer         |
| `results`    | `atc_report_get`      | A report's full text                                     |
| `stop`       | `atc_session_kill`    |                                                          |
| `events`     | `atc_events_read`     | A cursor, and a wait instead of a tight poll             |

atc's spawn and message tools answer a retried call with the same key with the first answer, and an
interrupted call with `outcome_unknown` and the ID it acted under. They therefore declare the
idempotency key route for reconciliation, as
[outside actions](../core/outside-actions.md#reconciliation-per-connector) describes.

Sessions that atc runs follow atc's rules, not nixie's, so the live view labels them as outside
nixie, as [0018](../../decisions/0018-main-thread-and-tasks.md) sets for outside agents. The model
in nixie sees atc's tools only through the adapter's tools, never atc's own, so the owner's rules
decide every start and message by the adapter's declared effects.

## The built-in adapter

The built-in adapter runs a single session in an imp, reusing the plumbing of the code tool. It
follows the coding placement from [0003](../../decisions/0003-sdk-placement.md): the model keeps
Claude Code's built-in tools inside the imp, and reaches nixie's tools on the host through the
[route](./sandbox-adapter.md#the-route-to-nixies-tools) every imp uses.

The session's grants follow the owner's risk stance for the coding context: none by default, and the
owner's rules may allow grants for that context, such as a git host and a package registry. Setting
such a rule is a widening, so it asks once, under 0022. The imp's egress allows the hosts its grants
name plus the hosts the owner's rule lists, such as a package registry's mirror, and nothing else.
The built-in adapter comes after atc, so the first build designs only its interface.
