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
another tool first, because the code imp has no route out. [The code tool](../../queue/code-tool.md)
holds the contracts, the limits and what the code image holds.

## The coding adapter

A coding session is long-running work on a repo, which needs version control, package registries and
credentials. nixie defines the interface, and each adapter owns how a session runs: its sandbox,
credentials, lifecycle and agent harness.

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

A session is a task, so it shows on the dashboard and the conversation routes your messages to it.
Starting and messaging a session are nixie tools with declared effects that your rules decide, and
both run as actions on the queue with the action ID as their idempotency key. The adapter's `events`
feed a trigger source with a cursor, so progress reaches the task's inbox as records.

## The atc adapter

atc runs coding sessions under its own rules, so each atc session is a supervised agent. nixie
reaches atc as an external server through the [MCP proxy](mcp-proxy.md), over atc's HTTP transport
with a scoped OAuth grant that the deployment configures.

| Adapter call | atc tool              | Notes                                                    |
| ------------ | --------------------- | -------------------------------------------------------- |
| `start`      | `atc_session_spawn`   | Takes an idempotency key; a workspace from a git ref     |
| `message`    | `atc_session_message` | Takes an idempotency key; the reply comes back as events |
| `status`     | `atc_session_get`     | State, the question it waits on, its last answer         |
| `results`    | `atc_report_get`      | A report's full text                                     |
| `stop`       | `atc_session_kill`    | Ends the session                                         |
| `events`     | `atc_events_read`     | A cursor, and a wait instead of a tight poll             |

atc answers a retried spawn or message with the same key with the first answer, and an interrupted
one with `outcome_unknown`, so both reconcile by idempotency key. The model sees only the adapter's
tools, never atc's own, so your rules decide every start and message.

## The built-in adapter

The built-in adapter runs a single session in an imp, with Claude Code's built-in tools inside the
imp and nixie's tools reached through the same route every imp uses. The session holds the model
credential. Any other grant, such as a git host or a package registry, comes from your rule for the
coding context, which asks once because it widens. The imp's egress allows the hosts its grants name
and the hosts your rule lists. The first build designs only this adapter's interface.
