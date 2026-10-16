# The server

The nixie server is the composition root: one process that loads the deployment configuration and
the secrets, opens the database as its one writer, and hands each module what it needs from the
others. Modules never import adapters, so the server picks each adapter, such as the imp sandbox
adapter, and passes it to the modules that take its interface. The server starts its parts in a
fixed order behind a health endpoint, reports each part's readiness, and stops by letting the steps
in flight commit. The repo ships it as the nixie image, which runs the release bundle as a non-root
user on a read-only root filesystem. `apps/server` holds the wiring, and `modules/ops` holds the
health checks and the logger.

[The database](../core/database.md) covers the writer lock, the epoch and migrations.
[Leases and recovery](../core/leases-and-recovery.md) covers runner pools and crash recovery, and
[sandboxes](../connectors/sandboxes.md) covers the imp adapter that the server adds images through.

## Configuration and secrets

nixie reads one YAML file, `/etc/nixie/config.yaml` by default, and parses it with a zod schema that
the server composes from one section schema per module or adapter. Each section belongs to the
package that reads it, so a module adds a key by changing its own schema. Every object in the schema
is strict, so nixie refuses to start on an unknown key as it does on an invalid value, and the error
it logs holds the path of the key. A typo therefore stops the start instead of leaving a default in
force. Each release publishes the schema as JSON Schema, which
[the release contract](release-pipeline.md#the-release-contract) covers.

Secrets never appear in the configuration. The configuration holds the path of the secrets file, a
sops file that nixie decrypts at start by running sops in a child process and reading its JSON from
stdout. The plaintext stays in the process's memory: it never touches a tmpfs, an environment
variable or a Compose secret, so neither the container's configuration nor its disk holds it. The
deployment key becomes a non-extractable AES-KW key at once. A restart decrypts again, so the
restart policy alone brings nixie back after a reboot.

The user's name and pronouns are private without being credentials. A deployment whose configuration
lives in a public repo therefore puts each of them in the secrets file's settings, and the
configuration names it with a `deployment:<name>` reference in place of the value. The server
resolves each reference once the secrets load, and refuses to start when the settings lack the
entry, so nixie never shows the model a reference in place of a name or a pronoun.

The sandbox manifest fixes the image of each kind of sandbox by digest. The release workflow writes
it into the nixie image, so the images a release runs are the images it was tested with. The server
names each image after its kind and its digest, so a new release adds its images beside the old ones
and never overwrites a name a running sandbox uses.

## The start sequence

The server refuses a bad configuration, secrets file or sandbox manifest before it opens anything.
It then starts the parts in a fixed order, and the health endpoint listens before the slow steps.

```mermaid
flowchart LR
  L["load config,<br>secrets, manifest"] --> W["writer: lock, epoch,<br>copy, migrate"]
  W --> H["health endpoint,<br>API, control socket"]
  H --> S0["first seed,<br>if none in force"]
  S0 --> R["recovery"] --> I["add images"] --> C["conversation imp"] --> M["memory"]
  M --> S["seed"] --> SR["start record"] --> RU["runners claim work"] --> Y["ready"]
```

Every record carries the snapshot hash of the definitions in force
([the definitions](../core/definitions.md)), so on a first start the seed runs before anything else
writes, recovery included. Recovery runs under the new writer epoch and before any runner starts, so
it sees every lease the last process left and settles each one
([crash recovery](../core/leases-and-recovery.md#crash-recovery)). Its sandbox cleanup destroys
every sandbox whose owner no longer runs, and keeps the conversation's sandbox, whose task never
ends, and the memory checker's, which the deployment owns.

The server adds each image in the manifest to impd before any part creates a sandbox, because a step
that creates a sandbox on an image impd lacks would fail. The server sends no add for an image that
impd holds under its name at the manifest's digest, so a token that may add no image still starts a
release once impd's administrator has added that release's images. The conversation imp then starts
on its image from the manifest, and the sandbox adapter replaces its sandbox when the image or the
model profile changed. The memory checker starts next on the conversation image
([the checker](../memory/writes.md#the-checker)), and the memory store starts behind it. The store
starts after the conversation imp, because a forget cleans up the conversation's sessions through
it, and before any runner claims work, so every forget that a crash left pending completes before a
turn can read the item ([forgetting](../memory/store.md#forgetting)). The seed runs after the memory
store, so a release's new definitions apply to the turns it runs. A record of the start follows the
seed, so the conversation hears of the restart
([the events block](../core/conversation-turns.md#the-events-block)). The record holds nixie's
version, the version of the start before it, and what the conversation is given: the names of its
tools and the version of its persona. Because the record follows the seed, it holds the persona this
start applies. Only then do the runners claim work.

The first seed, recovery, adding the images, starting the conversation imp and the memory store, and
writing the start record each wait and run again when they fail, with a log line per attempt. nixie
therefore stays live and unready while impd is down or the definitions refuse to seed, and the
container runtime sees why in the readiness report instead of a restart loop. Any other failure in
the sequence logs the error and ends the process, so the container runtime restarts it instead of
leaving it live with no runners. A stop during the sequence ends it at the next step, and waits for
the step in flight before any part closes.

A start whose database already holds a seed never waits on the definitions. When its seed is
refused, the runners start on the definitions in force, the definitions part stays unready, and the
definitions poll probes again after a short wait instead of a full interval. The wait doubles after
each failed probe or refused seed, up to the interval. A refused seed clears the poll's probe token,
so the next probe seeds whatever revision it finds, the last good one included, and a seed that
applies clears the refusal. A definitions checkout that lands a moment after nixie starts, as a sync
sidecar's first checkout can, therefore seeds within seconds.

## Health

The health endpoint serves liveness and readiness, each as a report with one entry per part, and a
status of 200 when every part is ready or 503 when one is not. An unready part carries a short
reason, never an error's message, because a message can quote what the part was working on.

Liveness holds when the process answers and the database answers a query. Readiness lists the parts
this build holds:

| Part             | Ready when                                                  |
| ---------------- | ----------------------------------------------------------- |
| database         | Migrations finished and the integrity check at start passed |
| definitions      | The last seed applied, with no refused snapshot pending     |
| imp host         | impd answers, and every image in the manifest is added      |
| conversation imp | Its sandbox started and the runners started                 |
| disk             | The data volume is under the fill limit                     |

The imp host and disk checks run on each request, and the rest read state that the start sequence
and the runners keep. The conversation imp stays unready until the runners start, so a start step
that keeps failing after the conversation imp starts, such as writing the start record, leaves nixie
unready instead of ready with no runner claiming work. Each check runs under a timeout, so a part
that hangs reports unready instead of holding the endpoint. The image's health check calls the same
endpoint from inside the container.

Readiness gates routing, so it holds only the parts without which nixie cannot answer a request. The
readiness report adds advisory parts, which show in its body and never change its status. The
conversation turns part is advisory: it turns unready once the conversation's errors in a row reach
the error limit, with the sandbox host's code when the last turn failed there, and the next turn
that commits clears it. A turn that fails because an imp cannot wake therefore leaves nixie in its
Service, and the API, the web UI and the health endpoint keep answering while the conversation
retries.

## Logs

nixie logs JSON lines to stdout. Each line holds envelope fields only: an event name, IDs, kinds,
counts and outcomes. Message text, tool arguments and tool results never reach a log line, because a
line that copied them would keep them after their key is gone
([erasable fields](../core/erasable-fields.md)). The logger writes the envelope on both sides of the
event's fields, so a field can never overwrite the event name or the time.

Each event has a level: debug, info, warn or error, and an event logs at info unless its call names
another level. The server section of the deployment configuration sets the lowest level the log
writes, info by default, and nixie applies it once the configuration loads, so a failure to start
before then still logs. A line names its level unless the level is info, so an info line reads the
same as a line from before nixie had levels. A field named level never reaches a line, so an info
line cannot pass for another level. Every event logs at info today, so a level above info leaves
only a command's failure in the log.

Most events log only when nixie acts, such as a start, a seed or a check, so a conversation turn and
an idle nixie write no line. The definitions poll logs each probe, whether or not the definitions
changed, so the log shows the process and its timers alive between seeds. A seed logs only when the
probe finds a revision of the definitions that has not seeded yet. A seed logs its result with the
revision, the content hash and the snapshot hash of the definitions in force afterwards, so a
refused seed shows the last good seed, and the revision traces a behaviour to a commit of the
definitions. A refused seed adds its error's name and message, such as a definitions directory that
is not checked out yet, because the name alone leaves the cause to guesswork. A step error logs the
task, the step, the errors in a row, the task's next state, its retry time and the error's name, so
the log shows a failure that a retry hid. The error's message stays on the task's thread, because it
may quote a provider's reply or the model's input. A sandbox host error adds the call that failed,
the host's code and the host's own message, such as impd refusing a wake because its memory budget
is full, because that text names the failure and never quotes the turn's work.

## Stopping

nixie handles SIGTERM and SIGINT itself, because Bun running as PID 1 ignores a signal that the
process does not handle. The handlers exist before the start begins, so a signal that arrives during
migrations stops nixie once the writer is open. On the signal, every runner pool stops claiming at
once, and each step in flight gets the pool's grace period to commit. The server then stops its
parts in the reverse of their start order: the runners, the conversation imp, the HTTP and control
sockets, and the writer last. A step that misses its grace keeps its lease, and the next start's
recovery settles it. The process exits 0 after a clean stop and 1 when a part failed, such as
another process taking the writer. The container runtime's stop grace must exceed the runner pools'
grace, with room for the parts that stop after the runners, or the runtime kills nixie before the
writer closes.

## Host commands

A host command, such as the one that issues an enrolment code, runs as a second process in the
container. Only the writer may write, so the command never opens the database. It asks the running
server over a Unix control socket in the data directory, in a folder only nixie's user may enter.
Starting the server removes a stale socket file first, because the writer lock proves that no other
server runs.

The socket serves the host contract, a typed oRPC contract of its own beside the one
[the API](../channels/api.md) serves. Each host command calls one of its procedures through an RPC
client, and the contract checks every input before a procedure runs. The host contract stays out of
the API's OpenAPI document, because no device reaches the socket. A refusal keeps the code the part
behind the procedure threw, such as a memory store's stale version, so the command prints the status
and the reason. Any other failure answers 500 with its reason, because only nixie's user reaches the
socket.

The session host commands list the live device sessions and set the label of one, which writes the
label record [the API](../channels/api.md#device-sessions) describes. A label is one line of text,
because each message renders it beside the send time.

The reset command, `reset --keep-sessions --yes`, asks the server to
[reset the event log](../core/event-log.md#the-reset) and keep the live device sessions. It refuses
to run without both flags, because only a restore from a backup undoes a reset, and it prints that
backups from before the reset still hold the old data. The server answers once the reset finishes,
then stops and exits 0, so the container runtime starts it again through the normal start. A reset
that fails exits the server 1 instead, and the command exits non-zero.

The memory host commands list the pending memory proposals and approve or reject one. The server
answers each through the memory gate's own answer path, so an approval applies the bound operation
with its approval record and keeps the proposal's provenance ([memory writes](../memory/writes.md)).
An answer names the proposal and the action hash the listing showed. The gate refuses an answer
under another hash, to a proposal that closed or lapsed since the listing, or to one whose item
moved on, and applies nothing. Its approval record names the host as the identity that answered,
because a shell in the container reaches the socket and no device session does. The memory commands
answer once the memory store starts, and refuse before then. An approval that the gate holds for a
close match prints the matching item, and the user answers it again as a revision of that item or as
a new item. An approval may carry the user's own text in place of the proposal's, and the approved
version then records the user as its origin.

The memory item host commands show one item with every version, and edit, retire, restore, pin or
unpin it. Each change runs through the memory store as the user's own action, as a change in the
memory view does, so its version records the user as origin and source, and the earlier versions
stay in the item's history. An edit, a retirement and a restore name the version the user read, and
the store refuses one whose item moved past that version. A pin adds no version, because it changes
where the item shows and not what it says.

## The image and the release bundle

The release build bundles the server into a single script with the test-build flag set false, so the
bundler drops every branch behind it with its imports. The test sandbox, the crash tests' fault
points and the test policy rule therefore never ship
([the decision point](../policy/decision-point.md)). The SQLite worker is a second entry point of
the bundle, because the bundler does not follow a worker's file URL. The release build fails when
the bundle holds a fault point ID, the test rule's ID or a text that only the test sandbox holds,
and a test proves that a test build holds them, so the check cannot pass by matching nothing.

The nixie image builds in two stages. The build stage runs the release build, downloads each pinned
binary, sops among them, and the memory encoder's model files at a fixed revision, and checks each
file against the checksum the repo records, so a file that differs fails the build. The runtime
stage holds Bun, the bundle, sops, the sandbox manifest, the model files, and ONNX Runtime's package
with its linux-x64 binary alone. The bundle leaves ONNX Runtime out, because a bundle cannot hold a
native addon. The image holds no Claude Code build, no backup tools and no other `node_modules`. It
runs as a fixed non-root user with the data directory as its one volume, so the container runs with
a read-only root filesystem.

At start, nixie loads the encoder from the image's model folder before it opens the database, and
the start fails when the model does not load, so a broken image never runs with memory search on
keywords alone. The loader reads only that folder and fetches nothing. The image's encoder check
loads the model and encodes one query, and the image rehearsal in pull-request CI runs it with no
network.
