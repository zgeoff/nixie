# Live updates

A client tab holds one server-sent stream, `live.follow`, and reads again whatever the stream
reports as changed. The stream carries the records of the one thread on screen, and a `changed`
event that names each kind of state a commit touched, such as the pause, the task list or a backup
notice. A device screen opens the same procedure in its own form, which carries only its screen.

A change that writes no record, or that no write makes, still reaches the tab through a topic. A
backup notice marks its topic in the transaction that writes it, and the spend watcher publishes
`spend` when the gateway's stop differs from its last read. A task that comes due and a forget that
turns stuck reach the tab on a timer instead.

Nothing publishes a topic when a task comes due or a forget turns stuck. A task that comes due
changes the task list, so the tab reads the list at the `changesAt` time the list returns, as well
as on the `tasks` topic's `changed`. A forget turns stuck with no topic at all, so the tab reads the
stuck forgets on a timer alone. Roots such as `sessions`, `devices` and `erasure` have no topic
either. See [Topics](#topics) for each.

On a topic's `changed` event, the tab marks that topic's queries stale, and TanStack Query fetches
again each of them that a page still uses. When a stream opens, the tab marks the queries of every
topic stale, because `changed` has no event ID and a closed stream misses it. A stream that replaces
one that is still open skips that step, because the old stream carried every change until the new
one opened.

```mermaid
flowchart LR
  writes[module writes] -->|"commit, with topics"| commits[writer.commits]
  watcher[spend watcher] -->|"publishChanged"| commits
  commits --> stream["live.follow, one per tab"]
  log[event log] -->|"records of the thread on screen"| stream
  stream -->|"opened, record, changed, device"| client[web client]
  client -->|"invalidates by topic"| reads[TanStack Query reads]
  client -->|"sessions.shown"| registry[client registry]
  stream -->|"device stream opens and closes"| devices[device streams, in the devices module]
```

## The stream

`live.follow` takes one of two forms. The page form takes `afterSequence`, `thread` and
`clipPayloads`. The device form takes `device.pixels`. Both are strict objects, so a device form
never parses as a page form with its key stripped.

The page form answers these events:

- `opened`, always first. The stream sends it once it listens on `writer.commits`.
- `record`, for a record whose thread is the input's `thread`, in sequence order. Its event ID is
  the record's sequence. With no `thread`, the stream sends no records.
- `changed`, with the topics of one or more commits. It has no event ID, so a closed stream misses
  it, and the client reads every topic again when a stream opens, unless that stream replaces one
  that is still open.

The device form answers `opened` once its device stream is open, then `device` events with the
screen state and each change, as [the devices doc](./devices.md#the-streams) describes.

A page stream starts after the last event ID when that is a sequence of 1 to 15 digits, and
otherwise after `afterSequence`, and never past the head, because a start past the head would skip a
`session.revoked` record that names the caller. A shredded record arrives with `isRemoved`, which
the server reads from the `record.forget_started` record that names it. That record belongs to the
forget of a log record, and is a separate family from the `erasure.started` and `erasure.finished`
records that [Topics](#topics) covers. A `record` event reads the record as a page read does, as
[the API doc](./api.md#reading-and-the-live-stream) describes.

The API reads the head of the log, then checks the session, and refuses a missing or revoked session
with a plain 401. The head comes first, so a revoke that commits after the check lies past the head,
where the stream replays it. A `session.revoked` record that names the caller ends a page stream
with `UNAUTHORIZED`, whether or not it sends records. A device-scope session may open the device
form only, and the page form answers `FORBIDDEN`. A full session may hold a page stream and a device
stream at once. A full session whose device row is missing gets `NOT_A_DEVICE` from the device form.

The stream answers at `/rpc/live/follow`. A content blocker's default filter list blocks a path with
a `log` segment, so the stream has none.

One process holds the writer and every stream
([the database on one host](../../decisions/0011-sqlite-on-one-host.md)), so a stream wakes on the
commit event in its own process and watches no file. It sends a topic within a second of its commit,
and merges the topics of commits that land together into one `changed` event. A replay of records
sends the topics that wait between records, so a long replay never holds a topic back.

### Keepalive

The API writes a keepalive into a quiet stream at a fixed interval. oRPC's event iterator swallows
the keepalive comment, so the web client watches the bytes of the response and treats a stream that
sends no byte within its idle limit as dead. `liveStreamTiming`, in
[live-stream-timing.ts](../../../libs/contract/src/contract/live-stream-timing.ts), holds the
interval and the idle limit, and a test asserts that 3 keepalive intervals fit in the idle limit.

## Topics

A topic is the name of one root of the web client's query keys, and no two topics share a root. The
topics are the entries of `liveTopicSchema` in the contract, in
[live-topic-schema.ts](../../../libs/contract/src/contract/live-topic-schema.ts). A root can lack a
topic, and the contract test keeps a list of those unfollowed roots, `erasure` among them. The test
fails when a topic matches no root, or when a root has neither a topic nor a place on that list.

| Topic         | Reads under the root                                                |
| ------------- | ------------------------------------------------------------------- |
| `nixie`       | `nixie.read`, which holds the pause                                 |
| `spend`       | `spend.read`                                                        |
| `backups`     | `backups.readNotice`                                                |
| `approvals`   | `approvals.listItems`, `approvals.readProposals`                    |
| `calls`       | `calls.get`                                                         |
| `computer`    | `computer.readHandover`                                             |
| `tasks`       | `tasks.list`, `tasks.read`, `tasks.listEnded`                       |
| `triggers`    | `triggers.report`                                                   |
| `definitions` | `definitions.listTasks`                                             |
| `memory`      | every read under the `memory` root, which the memory page uses      |
| `notebook`    | every read under the `notebook` root, which the notebook uses       |
| `images`      | `images.list`                                                       |
| `connections` | every read under the `connections` root, such as `connections.list` |
| `mcp`         | every read under the `mcp` root, such as `mcp.listServers`          |

Each module that owns record kinds declares the topics each kind changes, and the server registers
them with the log through `registerRecordTopics` when it starts the writer. Every kind has an entry,
an empty list included, and a test walks every kind the modules declare and fails on a kind with
none. The log marks the topics of every record a transaction appends. A write that creates a task
marks `tasks` and `definitions`, because a new task can belong to a definition. A trigger's fire or
skip marks `tasks`, `triggers` and `definitions`, because it moves the watermark that the next run
of a definition reads. A trigger's arm or defer marks `triggers` and `definitions` for the same
reason. The log module owns the topics of the erasure records. `erasure.started` and
`erasure.finished` mark `memory` and `notebook`, because a forget of a memory item, a moment or a
note changes what those pages show. The topic map reads no payload to tell the kinds apart, so all
three kinds of forget mark both topics.

Two other marks cover a change with no record. `markChanged(tx, topics)` adds topics to the commit
of a transaction, and a transaction that rolls back drops them. `publishChanged(writer, topics)`
announces a change that no write made. The spend watcher calls it when the stop it reads, or whether
the gateway answers, differs from its last read.

A coding session's state has no topic of its own. The coding source lands each event of a session on
the task's thread as a record, and that record marks `tasks`, so the task list's `session` moves
through the same stream as any task change. A change to the coding source must keep that, because a
state change that lands no record on the task's thread never reaches an open tab.

Each topic has a test that makes the change and asserts that an open stream receives `changed` with
that topic.

A call has no stream of its own. The `calls` topic reaches a tab through the same stream as every
other topic, and the client reads `calls.get` again on it.

A task that comes due on a schedule changes the task list with no write, so the `tasks` topic never
fires for it. `tasks.list` returns `changesAt`, the earliest next run of a listed task, and the
client reads the list again at that time, besides reading it on the `tasks` topic.

A forget of any kind, whether of a memory item, a moment or a note, turns stuck once it stays open
long enough, with no write. The `erasure` root has no topic, and the web client reads
`erasure.readStuck` again on a timer. That timer covers only the stuck state. The erasure records
still mark `memory` and `notebook`.

## The client registry

The API holds one registry in memory, and a restart forgets it. The registry holds presence alone,
and the devices module holds the open device streams, so the two facts stay apart:

- Presence comes only from `sessions.shown` beats. An open stream never counts as present, because a
  background tab holds a stream open. The push notifier reads `presence.isPresent(withinMs)`.
- A device is online while one or more of its device-form streams are open, and for a grace time
  after the last one closes, as [the devices doc](./devices.md#the-streams) explains. A device-form
  stream of a device session keeps its session's last seen time fresh. A page stream never does, and
  neither does the device-form stream of a full session, so an idle tab's session lapses on
  schedule.

When a client goes away, the server ends its stream within 2 keepalive intervals and drops a
device-form stream from the device streams in the same step.

## The web client's side

[The client doc](./client.md#the-live-stream) describes how the web client holds the stream.
