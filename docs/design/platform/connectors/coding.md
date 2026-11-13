# Running code and coding sessions

- Decisions: [0003](../../../decisions/0003-sdk-placement.md)

nixie runs code for general work, such as processing a file or crunching data, through its code tool
in an imp with no credential grants. nixie is not a coding agent: it steers coding agents through a
coding adapter, with atc first and a built-in adapter that runs one session in an imp later.

## The code tool

The code tool takes a program, its language and the files it reads, and returns the exit code, the
output and the files the program wrote. It declares the `code_run` effect, and its result is outside
content. The code environment is the code and worker images that the
[sandbox adapter](sandbox-adapter.md) lists.

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

Input files come from nixie's own store, such as an attachment or a file a connector fetched. A
`skills` list places each named skill's folder read-only in the sandbox, as the
[skills design](../skills.md#scripts) sets out. Output files come back as outside content. A program
that needs outside data gets it through another tool first, because the code imp has no route out.

## The coding adapter

A coding session is long-running work on a repo, which needs version control, package registries and
credentials. nixie defines the interface, and each adapter owns how a session runs: its sandbox,
credentials, lifecycle and agent harness. A coding runner drives one adapter, and its key is the
adapter's ID.

```ts
interface CodingAdapter {
  id: string; // the runner key, such as 'atc'
  start(brief: SessionBrief, key: string): Promise<AdapterReply<SessionRef>>;
  status(session: SessionRef): Promise<AdapterReply<SessionStatus>>;
  message(
    session: SessionRef,
    text: string,
    key: string,
  ): Promise<AdapterReply<{ messageRef: string }>>;
  results(session: SessionRef): Promise<AdapterReply<SessionResult>>; // the last finished turn's final reply
  stop(session: SessionRef): Promise<AdapterReply<{ stopped: boolean }>>;
  events(
    cursor: JSONValue | null,
    signal: AbortSignal,
  ): AsyncIterable<{ cursor: JSONValue; events: SessionEvent[] }>;
}
```

A session is a task, so it shows on the dashboard and the conversation routes your messages to it.
Starting a session is the `task.start/<key>` variant, which declares `coding_start`, and a message
to it is the `task.message/<key>` variant, so your rules decide both. The start and each message run
as actions on the queue, with the action ID as their idempotency key. The adapter's `events` feed a
trigger source with a cursor, so progress reaches the task's inbox as records.
[The coding session runner](../../queue/coding-session-runner/README.md) holds the types, the step
and the records.

## The atc adapter

atc runs coding sessions under its own rules, so each atc session is a supervised agent. The
`coding-atc` adapter calls atc's procedures directly, through `@atcx/contract`, over atc's TCP
listener as a principal that atc's config lists. It never goes through the
[MCP proxy](mcp-proxy.md), and the model never sees atc's own tools, so your rules decide every
start and message.

| Adapter call | atc procedure                            | Notes                                               |
| ------------ | ---------------------------------------- | --------------------------------------------------- |
| `start`      | `session.spawn`, with `idempotencyKey`   | A git workspace from the repo and ref               |
| `message`    | `session.message`, with `idempotencyKey` | The answer comes back as events                     |
| `status`     | `session.get`                            | State, and the question it waits on                 |
| `results`    | `session.get`                            | `result`: the final reply of the last finished turn |
| `stop`       | `session.kill`, with `stopOnly`          | Stops the session and keeps atc's record of it      |
| `events`     | `events.read`                            | A cursor, and a wait instead of a tight poll        |

atc answers a retried spawn or message with the same key with the first answer, and an interrupted
one with `outcome_unknown`, so both reconcile by idempotency key. nixie's principal is granted the
cloud target only, so every session nixie starts runs there.

## The built-in adapter

The built-in adapter runs a single session in an imp, with Claude Code's built-in tools inside the
imp and nixie's tools reached through the same route every imp uses. The session holds the model
credential. Any other grant, such as a git host or a package registry, comes from your rule for the
coding context, which asks once because it widens. The imp's egress allows the hosts its grants name
and the hosts your rule lists. The first build designs only this adapter's interface.
