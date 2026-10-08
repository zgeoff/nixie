# The sandbox adapter

- Status: Proposed
- Decisions: [0003](../../decisions/0003-sdk-placement.md),
  [0007](../../decisions/0007-grants-and-taint.md), [0016](../../decisions/0016-own-interfaces.md),
  [0022](../../decisions/0022-coding-and-code-execution.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

The sandbox adapter runs anything that executes a model loop or code over untrusted content in a
sandbox of its own: the conversation, each worker, each run of the code tool, and each session on
the built-in coding adapter, under [0016](../../decisions/0016-own-interfaces.md). It covers the
sandbox lifecycle, a network policy that denies by default, credential injection that the sandbox's
code never sees, running a command, and the route back to nixie's tools on the host. imp is the
reference adapter. Everything in this doc beyond the decisions it links is a proposal.

## The interface

The shape below is a sketch in TypeScript; names stay provisional until the terminology pass.

```ts
interface SandboxAdapter {
  id: string; // such as 'imp'
  boundary: 'microvm' | 'container';
  create(spec: SandboxSpec): Promise<Sandbox>;
  get(id: string): Promise<Sandbox | null>;
  list(owner: string): Promise<Sandbox[]>; // every sandbox nixie made, for crash recovery
}

interface SandboxSpec {
  image: string; // a purpose-built image per kind of work
  owner: string; // the task step or tool call that the sandbox belongs to
  egress: { kind: 'none' } | { kind: 'allow'; hosts: string[] };
  grants: GrantSpec[]; // empty for code runs, the model credential for model loops
  toolRoute: boolean; // open the route back to nixie's tools
  limits: { vcpus: number; memoryMiB: number; diskMiB: number };
}

interface Sandbox {
  id: string;
  exec(command: ExecSpec, signal: AbortSignal): Promise<ExecResult>;
  spawn(command: ExecSpec): Promise<ExecStream>; // a long-lived process with stdin and stdout
  copyIn(files: FileSpec[]): Promise<void>;
  copyOut(paths: string[]): Promise<FileSpec[]>;
  toolRoute(): Promise<ToolRoute | null>; // where code in the sandbox reaches nixie's tools
  sleep(): Promise<void>;
  wake(): Promise<void>;
  destroy(): Promise<void>;
}
```

Every sandbox records the task step or tool call it belongs to, so step 5 of
[crash recovery](../core/tasks.md#crash-recovery) finds and destroys the sandboxes of steps that no
longer run. Every create, grant, wake, sleep and destroy is a record in the
[event log](../core/event-log.md).

`grants` reaches the [credential store](./credentials.md#grants-into-a-sandbox), which pushes each
value into the adapter's injecting backend. Outside a coding session, the adapter refuses a sandbox
spec that has both a grant and egress. **Why:** a grant is an exit for whatever the sandbox holds,
under [0007](../../decisions/0007-grants-and-taint.md), and a second exit beside it adds risk with
no use to a model loop. A coding session holds both only by the owner's rule for the coding context,
under [0022](../../decisions/0022-coding-and-code-execution.md).

## Sandboxes by kind of work

| Kind                      | Lifetime                   | Egress | Grants                                   | Tool route |
| ------------------------- | -------------------------- | ------ | ---------------------------------------- | ---------- |
| The conversation          | The deployment, kept awake | None   | The model credential                     | Yes        |
| A worker                  | One tool call              | None   | The model credential                     | Yes        |
| A run of the code tool    | One tool call              | None   | None                                     | No         |
| A built-in coding session | The session                | Allow  | The model credential, and others by rule | Yes        |

The model credential is the one grant a worker or the conversation holds, limited to the model API's
host, under [0026](../../decisions/0026-where-workers-and-the-conversation-run.md). A host that a
grant covers stays reachable under every egress policy, because imp's broker dials it from the host.
The [coding adapter](./coding.md#the-built-in-adapter) covers the grants and egress of a coding
session.

## The route to nixie's tools

A model loop inside a sandbox reaches nixie's tools over HTTP MCP, under
[0003](../../decisions/0003-sdk-placement.md). In imp 0.38.1, an allow entry admits a whole address,
so the [placement spike](../../../spikes/sdk-placement/README.md) found that an imp allowed to reach
nixie's endpoint on the host reached imp's management API on the same address. imp 0.40.2 keeps
address-level allow entries
([imp networking](https://github.com/zgeoff/imp/blob/v0.40.2/docs/architecture/networking.md#egress)).

imp 0.40.2 has a route that needs no allow entry at all: a reverse forward. nixie asks impd, through
its `/tunnel` socket, to listen on a port of the guest loopback, and impd hands each connection the
guest opens to that port back to nixie, which relays it to its own MCP handler
([reverse forwards](https://github.com/zgeoff/imp/blob/v0.40.2/docs/guides/reverse-forwards.md)).
The bytes travel over the guest agent's vsock connection, never over the guest's network, so the imp
keeps egress `none` and never has a route to any host address. `openReverseForward` in
`@zgeoff/imp-client` gives nixie each connection to relay itself, so nixie opens no listening port
on the host for its tools.

The design takes the reverse forward as the route, as the first owner decision in
[connectors](./connector.md#decisions-for-the-owner) proposes:

1. The sandbox adapter opens a reverse forward from `127.0.0.1:<port>` in the imp when it creates an
   imp with `toolRoute`, and closes it when it destroys the imp.
2. nixie relays each connection to the tool endpoint for that imp, which serves only the tools of
   the run the imp belongs to, as [tools](./tools.md#one-endpoint-per-run) covers.
3. The SDK in the imp reaches the endpoint at `http://127.0.0.1:<port>/mcp`, with `127.0.0.1` on
   `NO_PROXY` so the request skips the broker.

impd keeps each forward with the imp's ID and the caller that opened it, and refuses an accept from
another caller. nixie therefore knows which imp a connection came from without trusting anything the
guest sends, and the per-run bearer token from the placement spike becomes a second check rather
than the only one.

The reverse forward has 4 limits that the design accepts:

- A sleep ends the forward, and the adapter opens it again after the wake. The conversation imp
  stays awake in the first version, and a worker imp never sleeps.
- A forward relays at most 64 connections at a time, and each counts towards the imp's 256 open
  tunnels. A turn makes one MCP request per tool call, so a run stays far below it.
- Opening a forward needs a token with `exec` scope on the imp, which the adapter holds already for
  `exec`.
- The relay adds a hop through impd for every tool call, and its latency is unmeasured. The
  [open items](../open-items.md#spikes-to-run) list the spike that measures it on a dev instance.

The other routes, in order of preference if the reverse forward fails that spike:

- **A port-level allow entry,** a [candidate imp change](../open-items.md#candidate-imp-changes),
  which admits one port of the host address and nothing else.
- **nixie's endpoint on an address that serves nothing else,** such as a dummy interface on the
  host. It holds only while impd and every other service bind specific addresses, because a service
  that binds every address answers on the dummy one too.

## Running a command

`exec` runs one command to completion and returns its exit code, its output and its time, and
`spawn` starts a process whose stdin and stdout stay open, which runs the SDK of a worker or the
conversation. Both pass the environment by name: the SDK replaces the CLI environment with
`options.env`, so the guest process gets the broker's proxy and CA variables, `NO_PROXY` and the
placeholder for the model credential explicitly, as the placement spike found. Output past 1 MiB per
stream is cut, with the cut recorded, by default.

On imp, `exec` and `spawn` run through impd's exec over the guest agent's vsock, so the imp's
network policy never touches the host's control of its processes. A stop sends SIGTERM and kills the
process's cgroup 5 s later by default, through `kill_grace_ms`
([imp agent protocol](https://github.com/zgeoff/imp/blob/v0.40.2/docs/architecture/protocol.md#exec)).

## Images

nixie builds a purpose-built image per kind of work, under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md):

| Image  | Holds                                                         | Used by                         |
| ------ | ------------------------------------------------------------- | ------------------------------- |
| Agent  | A minimal base, Bun, and the SDK with its Claude Code build   | The conversation and workers    |
| Code   | A minimal base and the runtimes the code tool offers          | The code tool                   |
| Coding | The agent image plus git and the toolchains the owner chooses | Built-in coding sessions, later |

The deployment pins each image by digest, and an upgrade of nixie that changes an image builds and
pins the new one. **Why:** an image is code that runs over untrusted content, so it upgrades with
nixie and its version reaches every record of the run.

## A container adapter

A container adapter is valid under [0016](../../decisions/0016-own-interfaces.md), and its boundary
is weaker, because a container shares the host's kernel. It also has no credential broker, so nixie
would have to run an injecting proxy of its own: a forward proxy that terminates TLS for the model
API's host with a CA the container trusts, and adds the credential there. The design keeps the
interface open for it and builds only imp in the first build; the fifth owner decision in
[connectors](./connector.md#decisions-for-the-owner) asks whether to build it.
