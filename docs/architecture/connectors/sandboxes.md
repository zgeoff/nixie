# Sandboxes

nixie runs untrusted work in sandboxes: the conversation's model loop, the memory checker, each
worker, each code run, the fetch sandbox and each coding session. A sandbox gets only the network
and the credentials its kind of work needs. The spec builder sets the egress, the grants and the
tool route from the kind, so a caller that builds its spec there names only the kind of work. nixie
reaches sandboxes through its own sandbox interface, under
[0016](../../decisions/0016-own-interfaces.md). `modules/sandbox` holds the interface, the kinds,
the lifecycle records and the test sandbox, a test-build double that runs each guest as a local
process. The test sandbox reaches nothing outside nixie, so it stays in the module, and any module's
tests can run a real guest in it. `adapters/sandbox-imp` runs each sandbox as an imp microVM and is
the one package that imports imp's client. [Tool calls](./tool-calls.md) covers the endpoint a
sandbox's tool route reaches. [Web fetch](./web-fetch.md) covers the fetch sandbox's lifetime and
the fetcher that runs in it.

## Kinds of work

A sandbox spec holds the kind of work, the image, the owner, the egress, the grants, the tool route
and the limits. The owner is the task step or tool call the sandbox belongs to, which crash recovery
reads, and for a model loop it is the ID of the loop's run. The spec builder sets the rest of the
spec from the kind:

| Kind         | Egress    | Model credential | Tool route |
| ------------ | --------- | ---------------- | ---------- |
| conversation | None      | Yes              | Yes        |
| checker      | None      | Yes              | No         |
| worker       | None      | Yes              | Yes        |
| code run     | None      | No               | No         |
| fetch        | Public    | No               | No         |
| coding       | Allowlist | Yes, and others  | Yes        |

A grant is a credential that the sandbox runtime injects into requests for one host, so the guest
holds only a placeholder. Every grant is an exit for whatever the sandbox holds: a guest that can
make an authenticated request can carry its data out in it. Every adapter therefore checks a spec
before it writes a record or reaches its runtime, and refuses public egress with any grant, and a
grant beside any egress outside a coding session. A model loop's one credential, its model grant,
reaches only the model's API, and the loop has no network beside it.

## Records and recovery

Every create, grant, sleep, wake and destroy writes a sandbox record, and the sandboxes projection
holds one row per sandbox not yet destroyed, with the adapter that made it, its owner, its state and
its spec.

An adapter records a create before it makes anything. A crash between the record and the sandbox
then leaves a row that recovery finds, never a sandbox with no row. A create that fails removes what
it made and records the sandbox destroyed. An adapter rebuilds a handle from the stored spec, so an
adapter in a later process can destroy what the last process made, and crash recovery destroys every
sandbox whose owner no longer runs
([leases and recovery](../core/leases-and-recovery.md#crash-recovery)). A grant's environment holds
placeholders only, so a spec in a record never holds a credential.

## The tool route

A sandbox with a tool route reaches nixie's tools over a reverse forward, never over a network route
to the host.

```mermaid
flowchart LR
  G["guest<br>loopback port"] -->|"reverse forward<br>over impd"| R["adapter relay"]
  R -->|"the owner's run"| T["tool endpoint socket"]
```

imp opens the forward from a fixed loopback port inside the guest, and impd binds it to that one
imp, so the far end never depends on what the guest claims. For each connection the guest opens, the
adapter resolves the tool endpoint of the sandbox's owner afresh and relays the connection to it,
with backpressure both ways. A long-lived sandbox therefore follows its owner's current run, and a
tool endpoint that is down fails one connection, never the host process. The loopback stays on the
guest's proxy bypass list, so tool calls skip the credential broker's proxy.

A sleep ends the forward inside the imp, so the adapter closes its own side before imp sleeps the
imp, and opens it again after the wake. impd also sleeps an idle imp on its own. It holds the imp
through the snapshot, and a call that arrives meanwhile waits for the sleep and then wakes the imp.
impd ends the forward only once the snapshot is written, and never restores it after the wake, so a
command that waited out the sleep would start a guest whose tool connections are refused. Before a
command runs in a sandbox with a tool route, the adapter therefore asks impd to wake the imp: the
wake waits out a sleep in progress, the forward has ended by the time it returns, and the adapter
listens again on the woken imp before the guest starts. An idle sleep can also start between that
wake and the command, and the command then waits out that sleep too. impd reports when the command
has started, which comes after any such wake, so the adapter waits for that report and then listens
again if the forward ended in the meantime.

## The imp adapter

Each sandbox is one imp, named by its random sandbox ID, and the adapter maps no egress, public
egress and an allowlist onto imp's matching egress policies.
[Names in impd](../deployment/impd-names.md) gives the rules for the names of the imps, the images
and the secrets.

- **Grants.** imp's broker injects each granted secret from the host, so a grant never adds a host
  to the imp's egress policy. The adapter stores a secret with the broker under its name, for one
  host and one header, and keeps a name it already holds, because a live grant may name it. Before
  it writes anything, the adapter refuses a grant whose secret the broker would send to any host but
  its own one.
- **Public egress.** Public egress reaches the internet and nothing inside the deployment: not the
  host, not impd's API, not another sandbox. The deployment lists the host's own addresses and its
  other inside ranges, and gives the same lists to impd and to nixie. The adapter refuses public
  egress when the host address list is empty, or when impd cannot enforce public egress, because a
  host address the list leaves out is reachable from a public imp.
- **Credentials at start.** A command in an imp with a grant starts only once impd has set the
  broker's variables for that boot, and impd refuses a command whose environment replaces one of
  them.
- **Backups.** A sandbox's disk holds the user's conversation, so a copy of it in impd's backups
  would outlive a forget. The adapter creates every imp with impd's backup opt-out, which holds for
  the imp's life, and refuses to create one on an impd that would ignore it. An imp made before the
  opt-out stays backed up, so the adapter marks one it lists as retired. Its owner then replaces it
  as it does for a changed spec, and the conversation's sandbox carries its session into the
  replacement.
- **Images.** impd's image eviction removes an unpinned image that no imp uses, and a token scoped
  to nixie's imps cannot pin one. The fetch sandbox lives for one fetch, so its image can go between
  fetches. Before each create, the adapter adds the sandbox's image again when impd no longer holds
  it, from the ref the server added it with at start.

## Running a command

A command runs in one of two forms. It runs to its exit, with a cap on each output stream that the
result reports, or it runs as a long-lived process, such as a model loop, that exchanges
length-prefixed messages over stdin and stdout. A message past the caller's limit stops the process
and ends the stream with an error, so a guest cannot make the host buffer more than the caller
allows. Files copy in and out by absolute guest path, and a path that climbs out of the guest fails.
A copy out of the guest is capped, so a guest cannot fill the host's memory.

Both forms pass the environment by name, with each grant's placeholders added. A stop sends SIGTERM
once, and the guest's agent kills the command's whole cgroup after a grace period, so no descendant
outlives it.

## The test sandbox

The test sandbox runs each guest as a local child process with no isolation, so it is not a security
boundary: a guest reads and writes whatever nixie's user can, and reaches any network the host
reaches. It writes the same records and refuses the same specs as the imp adapter, but enforces no
egress and injects no grant. Each sandbox gets a directory of its own that stands in for the guest's
filesystem, each command leads its own process group so a stop kills the group, and the tool route
is a relay on a free loopback port. A member that leaves its process group escapes the kill, which
imp's cgroup catches. The test sandbox refuses a command on a sleeping sandbox, where imp would wake
it, so a test that forgets a wake fails instead of hanging.

A guest runs the source of its package from the workspace with nixie's own Bun, in place of its
image. A guest with a grant gets the grant's placeholders and the credential broker's variables from
nixie's own environment: its proxy, its bypass list and the certificate its proxy signs with. On a
host whose broker injects the credential for the grant's host, such as an imp that runs a preview,
the guest's model calls therefore reach the model's API through that broker, and neither nixie nor
the guest holds the key.

The configuration's sandbox section selects the adapter, imp unless it names the test sandbox, and a
test sandbox needs no imp section and no impd token. Only a test build holds the test sandbox. The
release build's configuration schema refuses it, the bundler drops it and its imports from the
release bundle, and the release build fails when the bundle holds it, so a release can never run a
guest without isolation.
