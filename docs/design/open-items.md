# Open items

Phase 3, the design phase, has the voice stack and the model per job undecided, and the Google
refresh on day 8 still to run. The design work ahead covers the terminology pass, the channel
adapter and trigger source, main-thread routing and grants with expiries, and the stages agreed for
after the first build.

## Deferred decisions

- **The voice stack.** Voice runs in nixie's own client under
  [0009](../decisions/0009-first-channel.md), and the
  [first-token spike](../../spikes/sdk-first-token/) measured an Agent SDK turn: Haiku 5.5 at low
  effort reached its first token in 0.57 s at the median on a process held open, which puts a reply
  about 2 s after the owner stops speaking. A pipeline of speech-to-text, nixie's own turn and
  text-to-speech is the default design, and a speech-to-speech model such as GPT-Live 1 replaces it
  only if that time rules the pipeline out. The owner expects the speech-to-speech route to win.
  Voice is essential but not part of the first build.
- **Approval during a voice call.** A spoken yes is a chat message, so it never counts as an
  approval under [0002](../decisions/0002-approvals.md). The voice design needs a route to the
  approval button during a call, or the proposal waits until the call ends.
- **A model per job.** The [model-eval spike](../../spikes/model-eval/README.md) recommends
  different models for chat, memory writing, tool calls and long background reasoning, with low
  reasoning effort for chat, because effort sets cost and latency more than any other setting. No
  decision adopts the split, and the spike ran 2 samples per cell, so its numbers are indicative.
- **How a sandboxed session reaches nixie's endpoint.** In imp 0.40.2, an allow entry admits a whole
  address, so an imp allowed to reach nixie's tools on the host reaches imp's management API too
  ([0003](../decisions/0003-sdk-placement.md)). The
  [sandbox adapter](./connectors/sandbox-adapter.md#the-route-to-nixies-tools) recommends a reverse
  forward from the imp's loopback over the guest agent's vsock, which needs no allow entry, and the
  first decision in [connectors](./connectors/connector.md#decisions-for-the-owner) asks the owner.
- **The SDK transcript as a store.** The Agent SDK keeps its own transcript under
  `CLAUDE_CONFIG_DIR`. Phase 3 decides whether the owner must be able to read and export it, or
  whether nixie's own event log supersedes it as a cache, which sets how backups and export treat it
  under [0001](../decisions/0001-durable-layer.md).

## Spikes to run

- **The Google refresh on day 8** (minutes, on or after 2026-10-16): run `bun refresh.ts` in the
  [Google OAuth spike](../../spikes/google-oauth/). Day 0 showed an unverified production client
  holding Gmail's restricted scope; day 8 shows whether its token outlives testing mode's 7-day
  limit ([0019](../decisions/0019-connector-authorization.md)).
- **Retrieval on nixie-shaped memory** (about 1 day): compare keyword search, full-text search with
  BM25 ranking, and full-text search with vectors over a few hundred memory items, with questions
  the owner writes. It tests whether embeddings help at personal scale over the rows from
  [0010](../decisions/0010-memory-store.md). The research recommends keyword search first, and no
  decision records the route from memory to the model
  ([memory research](../research/2.4-2.6-data-channels-connectors.md#memory)).
- **A memory poisoning run** (about half a day): replay poisoned emails through a worker, and
  confirm that every memory write they cause reaches the owner as a proposal with untrusted
  provenance under [0011](../decisions/0011-memory-writes.md).
- **Backup and restore** (about half a day): restore a database dump or a SQLite copy to a clean
  host with restic, from an age key held on a passkey or a paper key. It checks that the per-item
  keys from [0010](../decisions/0010-memory-store.md) survive a lost host.
- **A deployment on a throwaway host** (about half a day): a Compose file that pins an image,
  secrets encrypted with sops and age, and a dependency bot. Merge a version bump and roll it back
  with a database restore, to confirm that an upgrade is a merge and a rollback is a revert plus a
  restore under [0020](../decisions/0020-deployment.md).
- **auto-mode on nixie's scenarios** (effort unknown): run auto-mode against nixie's scripted
  scenarios and measure the bar from [0008](../decisions/0008-auto-mode.md): catastrophic actions
  allowed per stage, harmless denials per action, consent credited, and escalations per task. nixie
  switches auto-mode on only when it meets that bar.
- **Owner messages into a running task** (about half a day): test a `now` message while the model
  writes text, a `now` message during a tool that cannot move to the background,
  `shouldQuery: false`, and `interrupt()` with queued messages. The answers shape how routing from
  [0018](../decisions/0018-main-thread-and-tasks.md) delivers a message to a running task.
- **The sandboxed placement under load** (about half a day): a long turn under imp's broker, which
  serves HTTP/1.1 only, with a token rotation mid-turn, and parallel tool calls over HTTP MCP. The
  spike for [0003](../decisions/0003-sdk-placement.md) saw only short turns and one call at a time.
- **A second guard on the mod** (about 2 hours): an SDK `PreToolUse` callback that denies every call
  while the policy mod's command is missing. The mod guards the SDK's built-in tools under
  [0002](../decisions/0002-approvals.md), and the earlier spike showed the failure signal, not the
  guard.
- **Model choice on real use** (about 1 day): repeat the model-eval memory and tool tasks on a real
  conversation history, real services and a long context, with more than 2 samples per cell and
  direct API calls. It firms up the model-per-job split above.
- **Tools through a reverse forward** (about half a day, on a dev instance of imp): run a worker
  turn whose SDK reaches nixie's tools at a loopback port that a reverse forward relays to the host,
  with the imp on egress `none` and the model credential as its one grant. Measure the time a tool
  call adds against the bridge-address route from the
  [imp worker spike](../../spikes/imp-worker-start/), check that impd's API is unreachable, and
  sleep and wake the imp to confirm the forward reopens. It settles the route that the
  [sandbox adapter](./connectors/sandbox-adapter.md#the-route-to-nixies-tools) recommends.
- **An OAuth redirect to a tailnet hostname** (about 1 hour): add an HTTPS redirect URI on a tailnet
  hostname to a Google web client and to a Microsoft app registration, and complete a consent with
  each. It shows whether setup can redirect to the client itself, under the third decision in
  [connectors](./connectors/connector.md#decisions-for-the-owner).
- **Microsoft Graph and iCloud** (about half a day and about 2 hours): consent to mail and calendar
  scopes with a personal Microsoft account in a free Azure directory, and read iCloud mail, events
  and contacts with one app-specific password. Run them when a connector for either provider is
  next, under [0019](../decisions/0019-connector-authorization.md).

## Phase 3 design tasks

- **The terminology pass.** The terms in [0018](../decisions/0018-main-thread-and-tasks.md), such as
  main thread, task and worker, are provisional, and a terminology pass settles them before any
  code. It may draw on a metaphor such as the chief of staff.
- **The channel adapter and the trigger source, in full.** The first build needs a client and
  schedules, so Phase 3 designs both interfaces from [0016](../decisions/0016-own-interfaces.md)
  completely. The trigger source records a cursor per source in the event log, and the design
  decides which connectors need push at all.
- **Main-thread routing and the task board.** The main thread routes each owner message to a task
  and names where it sent it, from a live task board of every task's status
  ([0018](../decisions/0018-main-thread-and-tasks.md)). Routing quality is on the critical path,
  because a misrouted message fails quietly. [Tasks](./core/tasks.md#routing-from-the-conversation)
  proposes the routing tools and records.
- **The live view.** The live view shows running and finished tasks and what each did and why, as a
  projection of the event log that the task board reads too
  ([0018](../decisions/0018-main-thread-and-tasks.md)). The
  [event log design](./core/event-log.md#the-live-view-and-the-task-board) proposes how both read
  it.
- **Grants with expiries.** Authority granted for a period, such as "full authority to build and
  ship today", is a rule with an expiry, and widening a rule always asks
  ([0018](../decisions/0018-main-thread-and-tasks.md)). Phase 3 designs how the owner grants, sees
  and ends such a rule.
- **Compaction controls and the pinned core.** [0024](../decisions/0024-memory-in-context.md) runs
  the conversation on the SDK's session and compaction. Phase 3 checks which compaction controls the
  SDK offers, and how large the pinned core can grow before the prompt pays for it.
- **The starter rule set and the digest sheet.** How restrictive nixie feels depends on the starter
  rules and the "no match means ask" default from [0004](../decisions/0004-rule-engine.md). The
  digest sheet's layout and grouping from [0006](../decisions/0006-approval-record.md) are designed
  together with them.
- **The scripted prompt scenarios.** Scenarios such as finding something on the web, triaging an
  inbox and booking a table report every prompt with its cause, so the 0-prompt target from
  [0005](../decisions/0005-effects-and-taint.md) can fail a test. They count the prompts where a
  destination comes from search results, the signal for typed workers under
  [0014](../decisions/0014-search.md).
- **The durable layer.** nixie owns leases, durable timers, retries, wake-ups and a run viewer, each
  with crash tests ([0001](../decisions/0001-durable-layer.md)), and [tasks](./core/tasks.md)
  designs them. The crash tests confirm that a resumed turn never repeats an outside action that
  ran, and the estimate of 800 to 1,500 lines is untested.
- **Budgets and the spending stop.** Raising a budget is in the always-ask set from
  [0005](../decisions/0005-effects-and-taint.md), and no decision sets where nixie enforces a
  budget. The research recommends a hard spending stop in a proxy in front of the model, not in the
  SDK ([2.1 landscape](../research/2.1-landscape.md#recommendation-for-22)).
- **Rule identity and snapshot hashing.** Snapshots under
  [0013](../decisions/0013-definition-versioning.md) need a canonical form for persona and job
  definitions written as markdown. A rule's ID stays fixed across edits or each edit mints a new
  one, and the last-fired record in [0006](../decisions/0006-approval-record.md) needs a fixed ID.
- **Memory consolidation.** Phase 3 decides when consolidation runs as a proposal under
  [0011](../decisions/0011-memory-writes.md).
- **A budget for paid tool calls.** A search on Kagi costs about $0.012
  ([0014](../decisions/0014-search.md)), and the budgets in the policy design count `spend` tools
  and model cost only. A budget kind for tool calls that cost money without the `spend` effect would
  let the owner cap search and similar services.
- **Upgrades on the host.** A merged upgrade reaches the host by a webhook, a poll from the host, or
  the owner running one command, and a poll needs no inbound route
  ([0020](../decisions/0020-deployment.md)). The seeding conflict view and the export of runtime
  rules as a pull request are part of the same design.

## Later stages

- **Taint per job run.** A job that reads only the owner's data runs without the destination limits
  ([0015](../decisions/0015-taint-scope.md)). The first build records the source of every tool
  result to support it.
- **auto-mode checks on free-text replies.** A job that sends free text to an allowed destination,
  such as a reply to a sender, can leak whatever its tools reach, and in the first build only the
  tool list limits it ([0015](../decisions/0015-taint-scope.md)). The check guards that send.
- **An outbound URL check** that blocks a web fetch whose URL carries private context
  ([0015](../decisions/0015-taint-scope.md)).
- **Typed workers or disposable branches** for jobs that must stay clean
  ([0015](../decisions/0015-taint-scope.md)). [0005](../decisions/0005-effects-and-taint.md) gives
  each typed worker a typed output per capability, and a high count of prompts where a destination
  comes from search results under [0014](../decisions/0014-search.md) marks the flows to start with.
  nixie's policy decides which low-information types it endorses as clean.
- **The passkey check for high-risk approvals.** The first build approves everything with a tap, and
  a passkey check for the always-ask set follows as an early addition
  ([0012](../decisions/0012-high-risk-approvals.md)).
- **The MCP proxy.** It arrives with the first outside MCP server, the atc adapter
  ([0017](../decisions/0017-mcp-proxy.md)), and [the proxy design](./connectors/mcp-proxy.md) covers
  it. How long a server keeps an input request valid for a retry is still unknown, and judging taint
  by output field waits for taint per job run.
- **Outside agents in the live view.** Entities that nixie starts but that run under their own
  rules, such as coding sessions started through atc, show in the live view labelled as outside
  nixie. It is a low priority, while managing atc sessions is a high priority for v1 or v2
  ([0018](../decisions/0018-main-thread-and-tasks.md)).
- **One-tap memory review.** A tap on a notice such as "nixie stored 3 memories" shows those items,
  and the owner edits or purges each on the spot. [0011](../decisions/0011-memory-writes.md) sets it
  as a goal, not a v0 or v1 requirement.
- **An iOS build.** The native app is Android first, and an iOS build needs the Apple Developer
  Program, with TestFlight builds that expire after 90 days
  ([0009](../decisions/0009-first-channel.md)).
- **A chat app as a full channel.** Telegram or another chat app can carry the conversation as an
  opt-in for a context where the owner accepts the storage
  ([0009](../decisions/0009-first-channel.md)).
- **More search providers.** SearXNG or another provider can join Kagi as an adapter behind the
  search tool ([0014](../decisions/0014-search.md)).

## Candidate imp changes

imp is the owner's own project, and each item is a change that imp could take on where it fits imp's
design. Until imp does, nixie designs around the current behaviour.

- **A method and path filter on each grant.** It narrows grants for untainted work, such as a
  GET-only grant on one API path ([0007](../decisions/0007-grants-and-taint.md)). The
  [imp broker spike](../../spikes/imp-broker/README.md) gives its place in the broker's source. A
  grant to an imp that reads untrusted content stays an exit even with the filter, so 0007 holds
  either way.
- **Token refresh in the broker.** imp's broker injects a static value and never refreshes, so with
  imp as a credential backend, nixie's credential store refreshes tokens on the host and pushes each
  new value into imp ([0016](../decisions/0016-own-interfaces.md)).
- **Port-level allow entries.** They let a sandboxed session reach nixie's endpoint on the host
  without reaching imp's management API ([0003](../decisions/0003-sdk-placement.md)). The
  [sandbox adapter](./connectors/sandbox-adapter.md#the-route-to-nixies-tools) needs them only if a
  reverse forward fails its spike.
- **A fuller audit.** The broker records method, host, path, status and sizes for each credentialed
  request, and no refused request. An audit with refused requests lets the broker's log feed nixie's
  record under [0007](../decisions/0007-grants-and-taint.md).
- **A warm template.** A template taken after a warm-up turn, with entropy and identity reseeded on
  restore, would let a new worker skip the 2 s of cold reads that the
  [imp worker spike](../../spikes/imp-worker-start/README.md) measured. imp forks are disk-only by
  design, because a memory fork duplicates entropy and IDs, so the reseed is what makes a memory
  template safe ([tasks](./core/tasks.md#workers)).
- **Page cache kept across sleep.** For imps marked long-lived, keeping the guest's page cache in
  the snapshot would let a woken imp skip cold reads. It costs larger snapshots, a slightly slower
  sleep and more pressure on host memory, and its benefit is unmeasured.
