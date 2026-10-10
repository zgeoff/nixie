# The sandbox adapter

- Decisions: [0016](../../../decisions/0016-own-interfaces.md),
  [0007](../../../decisions/0007-grants-and-taint.md),
  [0022](../../../decisions/0022-coding-and-code-execution.md),
  [0026](../../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0030](../../../decisions/0030-connectors-and-sandbox-environments.md)

The sandbox adapter runs everything that executes a model loop or code over untrusted content in a
sandbox of its own: the conversation, each worker, each code run, and each session on the built-in
coding adapter. It covers the sandbox lifecycle, a network policy that denies by default, credential
injection the sandbox's code never sees, running a command, and the route back to nixie's tools. The
first build implements imp only, and a container adapter is sketched to keep the interface honest. A
[test build](../code-layout.md#test-builds) runs each guest through a process double instead, so CI
needs no imp host.

## The interface

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
  egress: { kind: 'none' } | { kind: 'public' } | { kind: 'allow'; hosts: string[] };
  grants: GrantSpec[]; // empty for code runs, the profile's model credential for model loops
  toolRoute: boolean; // open the route back to nixie's tools
  limits: { vcpus: number; memoryMiB: number; diskMiB: number };
}

interface Sandbox {
  id: string;
  exec(command: ExecSpec, signal: AbortSignal): Promise<ExecResult>;
  spawn(command: ExecSpec): Promise<ExecStream>; // a long-lived process with stdin and stdout
  copyIn(files: FileSpec[]): Promise<void>;
  copyOut(paths: string[]): Promise<FileSpec[]>;
  toolRoute(): Promise<ToolRoute | null>;
  suspension: { kind: 'memory'; sleep(): Promise<void>; wake(): Promise<void> } | { kind: 'none' };
  destroy(): Promise<void>;
}
```

Every sandbox records the task step or tool call it belongs to, so
[crash recovery](../core/tasks.md) destroys the sandboxes of steps that no longer run, through the
adapter that created each one. Every create, grant, wake, sleep and destroy is a record.

The adapter refuses `public` egress with any grant, and refuses a spec that has both a grant and
egress, outside a coding session. **Why:** a grant is an exit for whatever the sandbox holds, and a
second exit adds risk with no use to a model loop. Memory-preserving sleep is a capability: imp
returns `memory`, and an adapter that cannot keep memory returns `none`, so the core never maps
sleep onto a stop or a pause.

## Public egress

`public` egress is defined by this contract, not by any one adapter. A sandbox with `public` egress
reaches the global internet only. It cannot reach the host, the sandbox runtime's API, other
sandboxes, the loopback, private, link-local and tailnet ranges, or any range the deployment lists
as internal. Every adapter enforces it at the network layer, outside the guest.

The deployment lists every address of the host and every range the host forwards to, such as a
cluster's pod and service ranges. **Why:** a host address or a forwarded range that the list leaves
out is reachable from the guest, and a global host address passes a check for private ranges.

The imp adapter implements `public` egress with imp's `public` policy, with the deployment's ranges
in `IMP_HOST_ADDRESSES` and `IMP_EGRESS_DENY`.

## Sandboxes by kind of work

| Kind                      | Lifetime                    | Egress | Grants                                   | Tool route |
| ------------------------- | --------------------------- | ------ | ---------------------------------------- | ---------- |
| The conversation          | The deployment, kept awake  | None   | The model credential                     | Yes        |
| A worker                  | One tool call               | None   | The model credential                     | Yes        |
| A code run                | One tool call               | None   | None                                     | No         |
| The fetch sandbox         | Many fetches, then replaced | Public | None                                     | No         |
| A built-in coding session | The session                 | Allow  | The model credential, and others by rule | Yes        |

The model credential reaches only the host of its [model profile](../core/models.md), through the
adapter's injecting backend, which dials from the host. A grant never becomes a network exception in
the guest.

## The route to nixie's tools

An imp reaches nixie's tools through imp's reverse forward, and keeps egress `none`:

1. When the adapter creates an imp with `toolRoute`, it opens a reverse forward from
   `127.0.0.1:<port>` in the imp through impd, and closes it when it destroys the imp.
2. impd hands each connection the guest opens on that port to nixie over the guest agent's vsock,
   never over the guest's network. nixie relays it to the tool endpoint for that imp's run, as
   [tools](tools.md) covers.
3. The SDK in the imp reaches `http://127.0.0.1:<port>/mcp`, with `127.0.0.1` on `NO_PROXY` so the
   request skips the broker.

impd binds each forward to its imp and the caller that opened it, so nixie knows which imp a
connection came from without trusting the guest. The run's bearer token is a second check. **Why not
an allow entry:** an allow entry in imp admits a whole address, so an imp allowed to reach nixie's
endpoint on the host also reaches imp's management API on that address.

A sleep ends the forward, and the adapter opens it again after the wake. The
[reverse-forward spike](../spikes/tools-reverse-forward/README.md) has the added latency, the tool
calls through the stream, the isolation control and the reopen after sleep.

## Running a command

`exec` runs one command to completion and returns its exit code, output and time. `spawn` starts a
process whose stdin and stdout stay open, which runs the SDK of a worker or the conversation. Both
pass the environment by name: the broker's proxy and CA variables, `NO_PROXY` and the placeholder
for the model credential. `exec` cuts output past 1 MiB per stream, with the cut recorded. A `spawn`
stream carries framed messages, and its caller sets a limit per message. On imp, both run through
impd over vsock, so the guest's network policy never touches the host's control of its processes. A
stop sends SIGTERM and kills the process's cgroup 5 s later, by default, so no descendant outlives
it.

## Images

| Image        | Holds                                                              | Used by                         |
| ------------ | ------------------------------------------------------------------ | ------------------------------- |
| Conversation | A minimal base, Bun, and the SDK with its Claude Code build        | The conversation                |
| Code         | A familiar Linux environment with Node.js, Python and common tools | Code runs outside a worker      |
| Fetch        | A minimal base and the fetcher that extracts a page's text         | The fetch sandbox               |
| Worker       | The conversation image plus the code runtimes                      | Workers                         |
| Coding       | The conversation image plus git and your toolchains                | Built-in coding sessions, later |

The code and worker images hold Node.js and Python, and a toolbox with a shell, jq, ripgrep, grep
and the common Linux file and text tools. Bun stays where nixie's model harness needs it. The image
build pins every runtime, tool and library version, and the deployment pins the image by digest. The
model can inspect what is installed. Adding a runtime adds no egress and no grant.

## A container adapter sketch

The container adapter is a sketch that checks the interface assumes no microVM, and the first build
leaves it unbuilt. A container shares the host's kernel, so its boundary is weaker than imp's. The
sketch maps each part of the interface:

- **Lifecycle.** An OCI container from an image pinned by digest, with a read-only root, a bounded
  writable volume and an owner label that `get` and `list` recover. It gets no Docker socket, host
  network or privileged mode.
- **Tools and grants.** With `egress: none` the container has loopback only. A read-only mount holds
  only that sandbox's Unix sockets, to its run's tool endpoint and to a host proxy that injects the
  model credential.
- **Files and disk.** File copies use paths inside the sandbox root and reject escapes, and no host
  directory is mounted. The writable volume enforces `diskMiB`, and `create` refuses the spec when
  the storage backend cannot enforce it.
- **Allowed egress.** A coding session with allowed egress goes through an adapter-owned gateway
  that enforces its declared host list, never through unrestricted container networking.
- **Suspension.** `none`. A stopped container restarts through nixie's committed-step recovery.
- **Public egress.** The adapter must enforce [public egress](#public-egress) before a container can
  host the [web fetch](connector.md#web-fetch), through its adapter-owned egress gateway or a
  network policy with the same refusals.
