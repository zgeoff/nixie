# Running code and coding sessions

- Decisions: [0022](../../decisions/0022-coding-and-code-execution.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0030](../../decisions/0030-connectors-and-sandbox-environments.md)

nixie runs code for general work, such as processing a file or crunching data, through its code tool
in an imp with no credential grants. nixie is not a coding agent: it steers coding agents through a
coding adapter, with atc first and a built-in adapter that runs one session in an imp later.

## The code tool

The code tool takes a program, its language and the files it reads, and returns the exit code, the
output and the files the program wrote. It declares the `run_code` effect, and its result is outside
content. The code environment is the code and worker images that the
[sandbox adapter](./sandbox-adapter.md) lists.

- **From the conversation or a task,** each code run gets a fresh imp from the code image, with
  egress `none` and no grants, destroyed when the call returns.
- **From a worker,** the program runs in the worker's own imp, which serves one tool call and holds
  the model credential as its one grant. A second imp would isolate nothing the worker does not
  hold.

The tool runs on the host in both cases, so the decision point decides every code run and the record
holds it. A code run has these limits by default, each changeable per job:

| Limit     | Default |
| --------- | ------- |
| Wall time | 60 s    |
| Memory    | 1 GiB   |
| Output    | 1 MiB   |
| Files out | 20 MiB  |
| vCPUs     | 1       |

Input files come from nixie's own store, such as an attachment or a file a connector fetched. Output
files come back as outside content. A program that needs outside data gets it through another tool
first, because the code imp has no route out.

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
reaches atc as an external server through the [MCP proxy](./mcp-proxy.md), over atc's HTTP transport
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
