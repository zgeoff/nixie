# Sandboxes

nixie runs the conversation, each worker, each code run, the fetch sandbox and each coding session
in a sandbox of its own, through its own sandbox interface from
[0016](../decisions/0016-own-interfaces.md). `modules/sandbox` holds the interface, the kinds of
work and the lifecycle records. `adapters/sandbox-imp` runs each sandbox as an imp, and it is the
one package that imports imp's client. `adapters/sandbox-process` is the test-build double that runs
each guest as a local process. `apps/server` picks one of the two adapters.

## The interface

A `SandboxSpec` holds the kind of work, the image, the owner, the egress, the grants, the tool route
and the limits. The owner is the task step or tool call the sandbox belongs to.
[`types.ts`](../../modules/sandbox/src/types.ts) holds the interface.

`buildSandboxSpec` builds a spec from the kind alone, from this table:

| Kind           | Egress | Model credential | Tool route |
| -------------- | ------ | ---------------- | ---------- |
| `conversation` | None   | Yes              | Yes        |
| `worker`       | None   | Yes              | Yes        |
| `code_run`     | None   | No               | No         |
| `fetch`        | Public | No               | No         |
| `coding`       | Allow  | Yes, and others  | Yes        |

Every adapter calls `requireSandboxSpec` before it writes a record or reaches its runtime. It
refuses `public` egress with any grant, and a grant beside any egress outside a coding session.
**Why:** a grant is an exit for whatever the sandbox holds, and a second exit adds risk with no use
to a model loop.

## Records and recovery

Every create, grant, sleep, wake and destroy writes a record of kind `sandbox.<event>`, through the
recorder that `buildSandboxRecorder` returns. The `sandboxes` projection holds one row per sandbox
that is not destroyed, with the adapter that made it, its owner, its state and its spec.

- An adapter writes `sandbox.created` before it makes anything. **Why:** a crash between the two
  then leaves a row that recovery finds, never an orphan with no row.
- A create that fails removes what it made and writes `sandbox.destroyed` with the reason
  `create_failed`.
- `list(owner)` and `get(id)` read the projection and rebuild a handle from the stored spec, so an
  adapter started after a crash destroys what the last process made.
- A grant's env holds placeholders only, so a spec in a record never holds a credential.

## The imp adapter

Each sandbox is one imp, named by its sandbox ID: `nixie-` and 24 random hex digits, inside imp's
31-character limit. The adapter maps egress onto imp's policies: `none` onto `none`, `public` onto
`public`, and `allow` onto `box` with the spec's hosts.

- **Grants.** The adapter grants each secret through impd's broker, which injects the credential
  from the host. A grant never widens the imp's policy. Before it writes anything, the adapter reads
  the secret's broker rules and refuses a grant whose secret covers any host but its own.
- **Public egress.** The deployment lists the host's addresses in `IMP_HOST_ADDRESSES` and its other
  inside ranges in `IMP_EGRESS_DENY`, and gives the same lists to impd and to `parseImpConfig`. The
  adapter refuses `public` egress when `IMP_HOST_ADDRESSES` is empty, or when impd lacks the
  `publicEgress` feature or does not enforce egress. **Why:** a host address the lists leave out is
  reachable from a public imp.
- **The tool route.** A sandbox with a tool route gets a reverse forward from `127.0.0.1:8901` in
  the imp, opened with `openReverseForward`. The adapter relays each connection to the tool target
  that the composition root resolves from the sandbox's ID and owner. impd binds the forward to its
  imp, so the target never depends on what the guest claims.
- **Sleep and wake.** A sleep closes the forward before impd sleeps the imp, and a wake opens it
  again. Every exec opens the forward first when it has closed, so the route stands again after a
  sleep that impd took on its own.

## Running a command

`exec` runs one command to its exit. It keeps the first 1 MiB of each output stream, and reports the
total bytes and whether it cut. `spawn` starts a process whose stdin and stdout carry framed
messages: a 4-byte big-endian length, then the payload, from `libs/wire`. A frame past the caller's
`maxMessageBytes` stops the process and ends the stream with `FrameTooLargeError`.

Both pass the environment by name, with each grant's placeholders added. The process double's
`mergeExecEnv` keeps `127.0.0.1` and `localhost` on `NO_PROXY`. **Why:** the tool route then skips
the broker's proxy.

On imp, an exec with a grant requires the broker, so the command starts only once impd set the
broker's variables for the boot. impd's variables hold `NO_PROXY` with the loopback, and impd
refuses an exec whose env replaces any of them, so the imp adapter sets no `NO_PROXY` of its own.

A stop sends SIGTERM once. On imp, the guest agent kills the exec's cgroup 5 s later, from
`killGraceMs`. The process double kills the process group instead.

## The process double

`buildProcessSandboxAdapter` runs each guest as a local child process with no isolation. It writes
the same records and refuses the same specs as the imp adapter. It enforces no egress and injects no
grant.

- Each sandbox gets a directory of its own, which stands in for the guest's filesystem. A guest path
  that climbs out of it fails.
- Each command leads its own process group. A stop sends SIGTERM to the group and SIGKILL 5 s later.
  A member that leaves the group with `setsid` escapes the kill, which imp's cgroup catches.
- The tool route is a relay on a free loopback port to the tool target.
- A sleep stops every process with SIGSTOP, and a wake resumes them. An exec on a sleeping sandbox
  fails.

## The test build

`buildSandboxAdapter` in `apps/server` returns the process double when `NIXIE_TEST_BUILD` is true,
and the imp adapter otherwise. The test runner sets the constant in a preload, and the release
bundle defines it as `false`. **Why:** the bundler then drops the double and its imports, so the
release bundle holds no part of it. A test in `apps/server` builds both bundles and checks for a
string that only the double holds.

The isolation tests run against a real impd, and skip without one.
[The imp isolation runbook](../runbooks/imp-isolation-tests.md) runs them.
