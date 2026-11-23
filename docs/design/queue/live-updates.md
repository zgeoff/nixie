# Live updates and presence

- **Status:** draft

The web client learns of a change in 3 ways today: the record stream for thread records, the device
stream for a screen, and a poll every 15 to 60 s for the pause, the spending stop, backup notices,
approvals and the task list. Each client tab opens one server-sent stream, `live.follow`, which
carries the records of the thread on screen, a `changed` event that names each kind of state a
commit changed, and the screen of a device. One in-memory registry in the API holds presence and
device online state, and the push notifier and the devices module read it.

## Shape

```mermaid
flowchart LR
  writers[module writes] -->|"commit, with topics"| bus[commit bus]
  watcher[spend watcher] -->|"markChanged"| bus
  bus --> stream[live.follow, one per tab]
  log[event log] -->|"records of the thread on screen"| stream
  stream -->|"record, changed, device"| client[client]
  client -->|"read again"| reads[TanStack Query reads]
  client -->|"sessions.shown"| presence[presence registry]
  stream -->|"device stream opens and closes"| presence
  presence --> readers[push notifier, devices module]
```

## Contracts

### The stream

```ts
// A page: the records of one thread, and every changed topic.
const events = await client.live.follow({ afterSequence: 4812, thread: 't7k2' });
for await (const event of events) {
  // → { kind: 'record', record: { sequence: 4813, thread: 't7k2', kind: 'model.reply', … } }
  // → { kind: 'changed', topics: ['pause', 'tasks'] }
}

// A device screen: its screen state, and nothing else.
await client.live.follow({ device: { pixels: { width: 1080, height: 1920, pixelRatio: 2 } } });
// → { kind: 'device', event: { kind: 'idle', scene: [] } }
```

```ts
// contract. `live.follow` replaces records.follow and devices.follow for nixie's own clients.
const liveTopicSchema = z.enum(['approvals', 'backups', 'definitions', 'pause', 'spend', 'tasks']);

const followLive = signedIn
  .input(
    z.union([
      z.object({
        afterSequence: sequenceSchema, // the read's readAtSequence, or the last record received
        thread: threadSchema.optional(), // with none, the stream sends no records
        clipPayloads: z.boolean().optional(),
      }),
      z.object({ device: z.object({ pixels: pixelsSchema }) }),
    ]),
  )
  .output(
    eventIterator(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('record'), record: recordSchema }), // event ID: the sequence
        z.object({ kind: z.literal('changed'), topics: z.array(liveTopicSchema).min(1) }), // no ID
        z.object({ kind: z.literal('device'), event: deviceEventSchema }), // no ID
      ]),
    ),
  );

export type LiveTopic = z.output<typeof liveTopicSchema>;
```

The client maps each topic to the reads it invalidates:

| Topic         | Reads the client invalidates                                                              | What it replaces                  |
| ------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| `pause`       | `nixie.read`                                                                              | a 15 s poll                       |
| `spend`       | `spend.read`                                                                              | a 15 s poll                       |
| `backups`     | `backups.readNotice`                                                                      | a 60 s poll                       |
| `approvals`   | `approvals.listItems`, `approvals.readProposals`                                          | a 15 s poll                       |
| `tasks`       | `tasks.list`, `tasks.read`, `tasks.listEnded`, `triggers.report`, `definitions.listTasks` | a 60 s poll, and 2 record streams |
| `definitions` | `definitions.listTasks`                                                                   | a record stream                   |

### Marking a topic

```ts
// log module. The writer marks the topics its transaction changes; the commit event carries them.
await withWriteTransaction(writer, async (tx) => insertBackupNotices(tx, notices), {
  changes: ['backups'],
});

// A change that no write makes, such as the gateway's stop seen by the spend watcher.
markChanged(writer, ['spend']);
```

```ts
// log module
interface WriteOptions {
  readonly changes?: readonly LiveTopic[]; // dispatched on writer.commits after the commit
}

// …existing commit event, which gains the topics of its commit
interface CommitEvent extends Event {
  readonly changes: readonly LiveTopic[]; // empty for a commit that marks none
}
```

### A read that changes with time

```ts
// contract: tasks.list
await client.tasks.list({});
// → { readAtSequence: 4812, tasks: […], changesAt: new Date('2026-11-24T09:00:00Z') }

// …existing fields
changesAt: z.date().nullable(), // the earliest time a listed task changes with no write; null for none
```

### Presence

`sessions.shown` and its rules are in [the push notice](push-notice.md#presence).

```ts
// api module. In memory: a restart forgets it, and each client calls and opens again.
interface Presence {
  // a session whose newest sessions.shown lies within channels.telegram.presence_seconds
  readonly isPresent: () => boolean;

  // the device stream view the devices module reads today: open, isOnline, readPixels, resize
  readonly devices: DeviceStreams; // devices module type
}
```

## Constraints

### The stream

- The web client opens at most one `live.follow` per tab. Each page that needs records or topics
  reads them from that one stream.
- The stream sends a `record` event only for a record whose thread is the input's `thread`, and
  sends records in sequence order.
- The stream starts after `lastEventId` when that is a sequence of 1 to 15 digits, and otherwise
  after `afterSequence`, with the start clamped to the head.
- A `session.revoked` record that names the caller ends the stream with `UNAUTHORIZED`.
- A shredded record arrives with `isRemoved`, as on `records.follow` today.
- When the thread on screen changes, the client opens a new stream from that page's `readAtSequence`
  and closes the old one.
- The stream sends each topic of a commit within 1 s of the commit, and may merge the topics of
  several commits into one `changed` event.
- On each open of a tab's stream except the first, the client invalidates the reads of every topic,
  because a `changed` event carries no ID and a closed stream misses it.
- While the client shows live updates as unavailable, it reads each topic's reads every 60 s.
- When `tasks.list` returns a `changesAt`, the client reads the list again at that time.
- No page in the web client sets `refetchInterval` on a read that a topic covers.
- The stream wakes on the in-process commit bus. One process holds the writer and every stream
  ([0011](../../decisions/0011-sqlite-on-one-host.md)), so it watches no WAL file.

### Topics

- Each write that changes what a topic's reads return marks that topic in the same
  `withWriteTransaction` call.
- A module that learns of a change from outside nixie calls `markChanged` when it sees the change.
  The spend watcher calls it when the gateway's stop or reachability changes.
- A test for each topic writes the change and asserts that an open stream receives `changed` with
  that topic.
- A design that adds a read the client keeps fresh adds its topic to `liveTopicSchema`.

### Device screens

- The `device` input form sends only `device` events: the screen state first, then each change, as
  `devices.follow` sends today.
- A device-scope session may call `live.follow` with the `device` form only. The page form returns
  403, as every other call outside the device list does.
- A stream with the `device` form keeps its session's last seen fresh, every `lastSeenIntervalMs`. A
  page stream never does.
- A device is online while one or more of its `device` streams are open.

### Presence

- An open stream never counts as present. Only a `sessions.shown` beat does.
- A device-scope session never calls `sessions.shown`, and a browser in device mode never calls it.
- The push notifier reads `isPresent`, and the devices module reads `devices`, from the one
  registry.
- When a client goes away, the server ends its stream and drops it from the registry within 10 s. A
  test closes the connection and asserts the device turns offline.

### Keepalive and the transport

- The server sends a keepalive into a quiet stream every 5 s, and the web client treats a stream
  with no byte for 15 s as dead.
- The API sets the keepalive interval explicitly, and a test asserts that 3 intervals fit in the
  client's idle limit. oRPC 1.16.2 sets it with `eventIteratorKeepAliveInterval`; oRPC 2 moves it to
  `toFetchResponse.eventStream.keepAlive.interval` and raises the default to 15 s, so an upgrade
  keeps 5 s.
- nixie's API serves no WebSocket. The computer view's noVNC socket is the one exception: it relays
  the desktop's binary frames and input both ways, carries no change of state, and keeps its one-use
  ticket and `isWatched` rules from [the desktop and take-over](desktop.md).

## Decisions

- **One stream per tab, with three event kinds.** One stream keeps one keepalive, one reconnect loop
  and one place that registers a client. Today a tab can hold 3 record streams, and a browser opens
  at most 6 HTTP/1.1 connections to one origin.
- **A topic names the data that changed, and the client reads it again.** The reads exist and are
  tested, and a backup notice or a gateway stop changes with no record to send.
  [Open question](https://linear.app/zgeoff/issue/GEO-2823).
- **The writer marks a topic at its commit.** The module that writes knows what changed. A map from
  record kinds to topics would miss writes with no record, such as a backup notice.
- **Records go only for the thread on screen.** The task list and the views follow the `tasks`
  topic, so no page needs every thread's records.
- **The device stream is a form of `live.follow`.** A device screen and a page share the transport,
  the keepalive and the registry, and keep their own events.
- **The API module owns the presence registry.** It handles `sessions.shown` and every stream, and
  hands each reader the narrow view it reads. This moves the registry out of the channels module
  that [the push notice](push-notice.md#presence) named.
- **`records.follow`, `log.follow` and `devices.follow` stay, deprecated, and serve the events they
  serve today.** [Open question](https://linear.app/zgeoff/issue/GEO-2825).
- **The web client keeps its own reconnect loop.** It resumes by `afterSequence`, so it needs no
  `ClientRetryPlugin` and sends no `Last-Event-ID`. The server's `lastEventId` path serves other
  clients.

## Builder decides

- How the web client shares the one stream between its hooks, and how the view hooks move onto it.
- How the stream merges topics within the 1 s limit.
- Which tasks list fields set `changesAt`.
- The names of internal functions and files, and the test layout.

## Out of scope

- Push notices: [the push notice](push-notice.md) builds on this registry.
- The voice call's transport, which [the voice design](../platform/channels/voice.md) holds.
- One stream shared by several tabs of the same browser.
- The oRPC 2 upgrade. The keepalive constraint holds through it.

## Open questions

- **Does the stream send changed rows or only name what changed?** The owner settles it in
  [GEO-2823](https://linear.app/zgeoff/issue/GEO-2823).
  [The live view](../platform/channels/live-view.md#how-the-client-stays-current) sends each record
  with its changed projection rows, for every thread. Until then, the stream sends topics and the
  records of the thread on screen.
- **Does a signed-in browser in device mode count as present?** The owner settles it in
  [GEO-2824](https://linear.app/zgeoff/issue/GEO-2824). Until then, device mode never calls
  `sessions.shown`.
- **When do the old stream procedures leave the published contract?** The owner settles it in
  [GEO-2825](https://linear.app/zgeoff/issue/GEO-2825). Until then, they stay, deprecated.
- **Are `live.follow`, `changed` and the topic names right?** The owner settles it in
  [GEO-2826](https://linear.app/zgeoff/issue/GEO-2826). Until then, the build uses them.
