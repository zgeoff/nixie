# Open items

Phase 3, the design phase, has the voice stack and the model per job undecided, and the Google
refresh on day 8 still to run. The design work ahead covers the terminology pass, the channel
adapter and trigger source, main-thread routing and grants with expiries, and the stages agreed for
after the first build.

## Deferred decisions

- **The matching-key recovery path.** Generation-triggered, debounced Restic key snapshots are a
  candidate within the existing publication barrier. The encrypted-content recovery point, a paired
  cloud restore and the cadence under failures remain untested; a fresh data replica alone cannot
  recover absent keys.

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

## Spikes to run

- **Offsite replica and forget cleanup** (effort unknown): test the deployment-configured backend
  and encryption component with the data replica plus fresh keys. Test gateway crashes and restarts
  against the selected cloud backend, failed/stale key publication, complete backend key cleanup
  including object versions, and a restore after total host loss. The local Restic and
  [replica encryption](../../spikes/replica-encryption/) spikes test no cloud provider.

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
- **A deployment on a real host** (about 1 day): the [deploy spike](../../spikes/deploy-local/) ran
  the Compose path on local containers. A throwaway host with KVM adds what it left out: imp beside
  nixie with imp images added from a manifest, a pull from a public registry by digest, a Renovate
  pull request, the deploy script on a timer, restic over a network backend, a disk with LUKS, and a
  recovery key on a YubiKey ([deployment](./deployment/deployment.md#deployment-configuration)).
- **A rollback across outside actions** (about half a day): run outside actions after an upgrade,
  roll back with a restore, and confirm that each action reaches the restored log with its outcome
  and that its task starts paused ([upgrades](./deployment/upgrades.md#rolling-back)).
- **Kubernetes with imp** (effort unknown): run nixie as a one-replica StatefulSet with impd on the
  node, the shape [deployment](./deployment/deployment.md#kubernetes-with-pulumi) proposes, on the
  owner's own cluster.
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
- **Rough sketches of the connector, the credential store and the definitions source.**
  [0016](../decisions/0016-own-interfaces.md) and [0020](../decisions/0020-deployment.md) ask for
  sketches that check the channel adapter and the trigger source leave room for them. The credential
  store's backend interface is open, and the first real connector settles the final shapes.
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
- **The seeding conflict view and the export of runtime rules.** A seed shows a rule edited at
  runtime as a conflict, and nixie exports runtime rules to the definitions repo as a pull request
  ([0020](../decisions/0020-deployment.md)).
  [Deployment](./deployment/deployment.md#seeding-the-definitions) sets when a seed runs, and the
  client view and the export are left to design.
- **Connector setup.** Each owner registers their own OAuth client with each provider, so the setup
  guide and the client walk the owner through it
  ([0019](../decisions/0019-connector-authorization.md)).
- **The coding agent adapter and running code.** Design the adapter interface from
  [0022](../decisions/0022-coding-and-code-execution.md), with atc as the first adapter, and the
  tool that runs code in a disposable imp with no grants, which comes early.

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
- **The MCP proxy.** It arrives with the first outside MCP server
  ([0017](../decisions/0017-mcp-proxy.md)). It needs to know which MCP revision the SDK's in-process
  server speaks, whether it passes structured output through, and how long a server keeps an input
  request valid for a retry. Judging taint by output field waits for taint per job run.
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
  without reaching imp's management API ([0003](../decisions/0003-sdk-placement.md)).
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
