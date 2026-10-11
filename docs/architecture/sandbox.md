# Sandboxes

nixie runs the conversation, each worker, each code run, the fetch sandbox and each coding session
in a sandbox of its own, through its own sandbox interface from
[0016](../decisions/0016-own-interfaces.md). `modules/sandbox` holds the interface, the kinds of
work and the lifecycle records. `adapters/sandbox-imp` runs each sandbox as an imp, and it is the
one package that imports imp's client. `adapters/sandbox-process` is a test-build double that runs
each guest as a local process. The server picks one of the two adapters.

## The interface

A sandbox spec holds the kind of work, the image, the owner, the egress, the grants, the tool route
and the limits. The owner is the task step or tool call the sandbox belongs to. The kind alone sets
the rest of the spec:

| Kind         | Egress    | Model credential | Tool route |
| ------------ | --------- | ---------------- | ---------- |
| conversation | None      | Yes              | Yes        |
| worker       | None      | Yes              | Yes        |
| code run     | None      | No               | No         |
| fetch        | Public    | No               | No         |
| coding       | Allowlist | Yes, and others  | Yes        |

Every adapter checks the spec before it writes a record or reaches its runtime. It refuses public
egress with any grant, and a grant beside any egress outside a coding session. **Why:** a grant is
an exit for whatever the sandbox holds, and a second exit adds risk with no use to a model loop.

## Records and recovery

Every create, grant, sleep, wake and destroy writes a sandbox record. The sandboxes projection holds
one row per sandbox that is not destroyed, with the adapter that made it, its owner, its state and
its spec.

- An adapter records a create before it makes anything. **Why:** a crash between the two then leaves
  a row that recovery finds, never an orphan with no row.
- A create that fails removes what it made and records the sandbox destroyed.
- An adapter rebuilds a handle from the stored spec, so an adapter started after a crash destroys
  what the last process made.
- A grant's env holds placeholders only, so a spec in a record never holds a credential.

## The imp adapter

Each sandbox is one imp, named by its random sandbox ID. The adapter maps no egress, public egress
and an allowlist onto imp's matching egress policies.

- **Grants.** The adapter grants each secret through imp's broker, which injects the credential from
  the host. A grant never widens the imp's policy. Before it writes anything, the adapter refuses a
  grant whose secret the broker would send to any host but its own.
- **Public egress.** The deployment lists the host's own addresses and its other inside ranges, and
  gives the same lists to imp and to nixie. The adapter refuses public egress when the host address
  list is empty, or when imp cannot enforce public egress. **Why:** a host address the lists leave
  out is reachable from a public imp.
- **The tool route.** A sandbox with a tool route gets a reverse forward to a fixed loopback port in
  the imp. The adapter relays each connection to the tool target that the server resolves from the
  sandbox's ID and owner. imp binds the forward to its own imp, so the target never depends on what
  the guest claims.
- **Sleep and wake.** A sleep closes the forward before imp sleeps the imp, and a wake opens it
  again. Every command opens the forward first when it has closed, so the route stands again after a
  sleep that imp took on its own.

## Running a command

A command runs either to its exit, with a cap on each output stream that the result reports, or as a
process that exchanges length-prefixed messages over stdin and stdout. A message past the caller's
limit stops the process and ends the stream with an error.

Both forms pass the environment by name, with each grant's placeholders added. The loopback stays on
the proxy bypass list. **Why:** the tool route then skips the broker's proxy. On imp, a command with
a grant starts only once imp has set the broker's variables, which exempt the loopback, and imp
refuses a command whose env replaces any of them.

A stop sends SIGTERM once, and the process is killed after a grace period. On imp, the guest agent
kills the command's cgroup.

## The process double

The process double runs each guest as a local child process with no isolation. It writes the same
records and refuses the same specs as the imp adapter, and it enforces no egress and injects no
grant.

- Each sandbox gets a directory of its own, which stands in for the guest's filesystem. A guest path
  that climbs out of it fails.
- Each command leads its own process group, and a stop kills the group. A member that leaves the
  group escapes the kill, which imp's cgroup catches.
- The tool route is a relay on a free loopback port to the tool target.
- A sleep stops every process, and a wake resumes them. A command on a sleeping sandbox fails.

The server uses the process double only in a test build, and the bundler drops the double and its
imports from the release bundle. **Why:** a release can then never run a guest without isolation.
