# The sandbox adapter

- Status: Proposed
- Decisions: [0030](../../decisions/0030-connectors-and-sandbox-environments.md),
  [0003](../../decisions/0003-sdk-placement.md), [0007](../../decisions/0007-grants-and-taint.md),
  [0016](../../decisions/0016-own-interfaces.md),
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
  suspension: { kind: 'memory'; sleep(): Promise<void>; wake(): Promise<void> } | { kind: 'none' };
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
host, under [0026](../../decisions/0026-where-workers-and-the-conversation-run.md). A granted host
stays reachable under every egress policy through the adapter's injecting backend, which dials from
the host. A grant never becomes a guest-network egress exception. Imp uses its broker; the container
sketch uses the host injecting proxy. The [coding adapter](./coding.md#the-built-in-adapter) covers
the grants and egress of a coding session.

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

The agreed route is the reverse forward, under
[0030](../../decisions/0030-connectors-and-sandbox-environments.md):

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
  tunnels. A run holds one open stream for the MCP session and opens one connection per tool call,
  so it stays far below the limit.
- Opening a forward needs a token with `exec` scope on the imp, which the adapter holds already for
  `exec`.
- The relay adds a hop through impd. The
  [reverse-forward spike](../../../spikes/tools-reverse-forward/README.md) measures about 0.6 ms of
  added median HTTP time on a local host, including one local TCP hop. It completes an SDK tool call
  through the v2 subscription stream and after sleep and wake, with egress `none`.

The alternatives considered, if a later deployment cannot use the reverse forward:

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

| Image        | Holds                                                              | Used by                         |
| ------------ | ------------------------------------------------------------------ | ------------------------------- |
| Conversation | A minimal base, Bun, and the SDK with its Claude Code build        | The conversation                |
| Code         | A familiar Linux environment with Node.js, Python and common tools | The code tool, outside workers  |
| Worker       | The conversation image plus the code runtimes                      | Workers                         |
| Coding       | The conversation image plus git and the owner's toolchains         | Built-in coding sessions, later |

The code and worker images give agents a familiar environment, rather than only a language
interpreter. Node.js and Python are the primary general-code runtimes. The command-line toolbox
includes jq, ripgrep (`rg`) and grep, with a shell and the common Linux file and text tools. Bun
stays in the images that run nixie's model harness; Node.js is an actual runtime, not a promise that
Bun substitutes for it.

The image build pins the runtime, tool and library versions, and the deployment pins the image by
digest. The exact package inventory is a build artifact checked against representative agent
programs. The code tool exposes that inventory to the model, so it can inspect the available
commands and libraries. Adding a runtime or dependency does not add network egress or a credential
grant; the sandbox rules remain those in [sandboxes by kind of work](#sandboxes-by-kind-of-work). An
upgrade that changes an image builds and pins the new digest, which reaches the run's records. The
final image size and cold-start cost need measurement; the runtime choice makes no size claim.

## A container adapter sketch

The first build implements imp. The container adapter stays a design sketch that tests whether the
interface assumes a microVM. The owner agreed to sketch the adapter and defer its implementation. A
container shares the host's kernel, so [0016](../../decisions/0016-own-interfaces.md) treats its
boundary as weaker. Nothing in this sketch claims that a container implementation passes the same
isolation tests as imp.

### Lifecycle and files

The adapter creates an OCI container from an image pinned by digest, with an owner label and an
adapter-owned writable volume. `get` and `list` recover that label and volume after a host restart;
`destroy` removes the container, its volume, its relays and its grants. The core sees an opaque
sandbox ID, not a Docker container ID. Each adapter resolves `image` in its own image namespace.

`exec` and `spawn` map to controlled container exec sessions, with output limits and cancellation
that stops the command and its child processes. File copies use paths inside the sandbox root and
reject escapes; they do not mount the owner's filesystem. The container receives no Docker socket,
host network namespace or privileged mode. The image root stays read-only; every writable disk path
belongs to the bounded volume, and any tmpfs counts against the memory limit. CPU and memory limits
map to runtime controls; the writable volume must enforce `diskMiB`, rather than interpreting it as
an unenforced label. If the selected storage backend cannot enforce that limit, `create` refuses the
spec.

### Tools and credential injection

For `egress: none`, the container has an isolated network namespace with loopback only. An
adapter-owned relay exposes a loopback HTTP port to the SDK and connects to a per-sandbox Unix
socket on the host. The adapter bind-mounts a directory that contains only the enabled per-sandbox
sockets into the container. The mount is read-only, so the container can connect but cannot replace
socket entries. No arbitrary host directory, management socket or credential file joins that mount.
The host creates the directory and socket permissions for that sandbox and removes them at destroy.
This bounded socket mount is the explicit host channel; file copies introduce no other host mounts.

The tool socket reaches only that run's MCP endpoint, with the same bearer check as
[tools](./tools.md#one-endpoint-per-run); it is not a generic host-network tunnel. The host binds
that endpoint to the socket's registered sandbox and run, not an identity claimed by the guest.

Model access uses a separate credential-injecting proxy on the host. A loopback relay in the
container carries proxy traffic over its own Unix socket; the image includes the proxy's CA and the
SDK receives a placeholder. The model socket exists only when that sandbox has a grant, and the tool
socket exists only with `toolRoute`. Both sockets belong to the bounded mount above. The host proxy
accepts only a grant's destination, checks the upstream TLS identity and injects the value there.
The container never holds the real value. The
[credential store](./credentials.md#grants-into-a-sandbox) creates, rotates and revokes the grants;
no grant reaches a code-only container.

An allowed-egress coding session needs an adapter-owned gateway that enforces its declared host
list. It cannot turn on unrestricted Docker networking and call that an allow list. Both egress
modes need their own tests for management-port isolation, credential leakage, redirect handling and
revocation before a container adapter is usable.

### Suspension

The common interface makes memory-preserving sleep explicit through the `suspension` union. Imp
returns `kind: memory`; this container sketch returns `kind: none`. The core calls sleep and wake
only on the memory branch. A backend that cannot preserve memory cannot silently map sleep to stop,
and a backend that cannot free memory cannot silently map it to pause.

[Docker pause](https://docs.docker.com/reference/cli/docker/container/pause/) freezes processes
through a cgroup; it does not give the memory snapshot and release semantics of imp sleep.
[Docker checkpoint](https://docs.docker.com/reference/cli/docker/checkpoint/) offers checkpoint and
restore through CRIU, but is experimental and has restrictions on terminals and kernel support. This
sketch makes no checkpoint promise. A stopped container starts a fresh SDK process and uses nixie's
committed-step recovery; that is restart, not wake from preserved memory.

The first conversation stays awake, and workers are disposable, under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md), so neither needs memory
sleep to use this interface. A future memory-sleep requirement must choose a capable adapter or stay
disabled. A container prototype that passes checkpoint tests could add the memory branch without
changing the core's meaning of sleep.

### What remains unbuilt

The container sketch leaves the injecting proxy, Unix relays, egress gateway, disk quota backend,
process cancellation and isolation checks unimplemented. It is an interface check, not a supported
runtime. [Open items](../open-items.md#later-stages) keeps that implementation deferred.
