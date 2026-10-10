# Open items

Phase 3, the design phase, has the voice stack and the model per job undecided, and the Google
refresh on day 8 still to run. The design work ahead covers the terminology pass, memory validation,
and the stages agreed for after the first build.

## Deferred decisions

- **The local encoder model and library.** Local embeddings are agreed for the first build under
  [0031](../decisions/0031-memory-capture-context-and-removal.md). The synthetic spike's encoders
  are candidates, not adopted dependencies. Compare quality, runtime, memory use and pinned-asset
  packaging, then choose the model and library with the owner before product implementation.

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

- **Retirement and bulk permanent deletion.** Test typed intent against an exact item/version,
  ambiguous references, pasted instructions and unchanged content provenance. Test a restored or
  edited item after bulk preview, later retirements, duplicate confirmations and crashes between
  per-item key deletions. The [memory store](./memory/store.md#bulk-deletion-of-retired-memories)
  sets the contract. The [key-backup spike](../../spikes/forget-backups/) checks a local backend's
  snapshot removal and data pruning. Test the selected deployment backend, stale-copy publication
  races, failures and restarts before declaring completed forget safe on that backend.
- **Session recovery and invalid-cache cleanup.** Compare the proposed event-log rebuild with SDK
  resume: record which history and SDK state each preserves, test recovery after compaction and
  verify pending approvals and action outcomes come from canonical rows. Forget must remove every
  invalid local transcript branch and sidecar after its writer stops, including late writes. File
  and artifact recovery is separate. The [context design](./memory/context.md#rebuilding-a-session)
  states the limits of the agreed cache lifecycle.

  Include pinned-only exposure before an interrupted first turn commits, inherited fork
  dependencies, and a retained summary that contains an item created only through the memory client.
  After forget, restart must block old branches, remove their caches and dependent summary keys, and
  rebuild without the marker even when its source exceeds the recent-history window.

- **Batched memory capture.** The [offline batch spike](../../spikes/memory-batch/) checks a durable
  cursor, source-bound quote checks and recovery after process kills with fixture model output. A
  batch can exceed the conversation's 20-message evidence window, so source IDs must bind quotes to
  its original owner messages. Model quality, capture delay and cache/input costs remain unmeasured.
  Custom rollover needs live SDK continuity and compaction-boundary checks before it replaces the
  SDK route; the owner agreed batching with SDK compaction retained.
- **The semantic-index lifecycle.** Check the design's version gates and memory-only generations
  when a write, retire, forget or encoder change races with background encoding. A stale candidate
  must never return canonical text that is no longer eligible. Pause a result after validation,
  forget its item, then resume publication. Test a query across a generation swap, writes during
  rebuild catch-up, full startup coverage and the reported keyword fallback while semantic indexing
  rebuilds, under [memory in context](./memory/context.md#the-index).
- **The code environment inventory.** Build the Node.js/Python code and worker images with the
  common Linux toolbox from [0030](../decisions/0030-connectors-and-sandbox-environments.md). Check
  representative agent programs for file and text work, expose the installed command and library
  versions, and measure image size and cold-start cost. Package availability needs a built-image
  check; the runtime choice is settled.
- **Worker cold start with the code runtimes** (about 2 hours): time a fresh worker on the worker
  image, which carries the code runtimes, against the numbers that
  [0026](../decisions/0026-where-workers-and-the-conversation-run.md) rests on: 472 ms to create an
  imp and about 2.5 to 3 s to first text, about 2 s of it cold disk reads. A larger image that slows
  first text past that range reopens a separate, smaller worker image.
- **Start inside Elysia** (about half a day): mount Start's fetch handler in nixie's Elysia process,
  check the isomorphic oRPC link and device-session checks on both routes, and check that no server
  implementation reaches the browser bundle.
- **Android paste edge cases**: check Gboard clipboard chips and other keyboard insertion paths
  after the native paste module exists. Keep known ambiguous paths unknown until tested. The basic
  native paste hook belongs in the first Android build, under
  [0029](../decisions/0029-channels-and-clients.md).
- **The Google refresh on day 8** (minutes, on or after 2026-10-16): run `bun refresh.ts` in the
  [Google OAuth spike](../../spikes/google-oauth/). Day 0 showed an unverified production client
  holding Gmail's restricted scope; day 8 shows whether its token outlives testing mode's 7-day
  limit ([0019](../decisions/0019-connector-authorization.md)).
- **Retrieval on the owner's questions** (about half a day, with model calls): rerun the
  [retrieval spike](../../spikes/memory-retrieval/README.md) with questions the owner writes about
  memory items the owner recognises, and with recall keywords from a model that has not seen the
  items. On synthetic data, words alone found about a fifth of paraphrased questions and a local
  embedding model about two thirds. The owner agreed local embeddings in the first build; this run
  validates and tunes semantic recall, model choice and ranking rather than gating inclusion.
- **The pinned core in the system prompt** (minutes, with model calls): run the
  [pinned core spike](../../spikes/sdk-pinned-core/README.md), which is written and stopped on the
  subscription's weekly limit. It shows whether `snapshot: false` lets a changed pinned core reach a
  resumed session, and what a change costs the prompt cache.
- **The memory checker on real messages** (about half a day, with model calls): run the checker
  model from [memory writes](./memory/writes.md#the-checker) over owner messages the owner writes,
  each paired with memories they do and do not assert, including negations, questions and quoted
  remarks, and measure how often it confirms wrongly or misses. It can share a run with the consent
  checker, which uses the same implementation.
- **A resume after compaction** (about 2 hours, with model calls): compact a session after a step's
  recorded boundary, crash the next step, and resume at the boundary with `resumeSessionAt`. The
  [resume-at spike](../../spikes/sdk-resume-at/README.md) left it untested, and
  [memory in context](./memory/context.md#compaction) depends on it.
- **A memory poisoning run** (about half a day): replay poisoned emails through a worker, and
  confirm that every memory write they cause reaches the owner as a proposal with untrusted
  provenance under [0011](../decisions/0011-memory-writes.md).
- **Backup and restore** (about half a day): restore a database dump or a SQLite copy to a clean
  host with restic, from an age key held on a passkey or a paper key. It checks that the per-item
  keys from [0010](../decisions/0010-memory-store.md) survive a lost host. The
  [shredding spike](../../spikes/memory-shred/README.md) checked forgetting against backups on one
  host; Litestream replication of the key store, which would keep a deleted key for its own
  retention, is part of this run.
- **A deployment on a throwaway host** (about half a day): a Compose file that pins an image,
  secrets encrypted with sops and age, and a dependency bot. Merge a version bump and roll it back
  with a database restore, to confirm that an upgrade is a merge and a rollback is a revert plus a
  restore under [0020](../decisions/0020-deployment.md).
- **auto-mode on nixie's scenarios** (effort unknown): run auto-mode against the scripted scenarios
  in the [policy rules spike](../../spikes/policy-rules/README.md), with a model making the calls,
  and measure the bar from [0008](../decisions/0008-auto-mode.md): catastrophic actions allowed per
  stage, harmless denials per action, consent credited, and escalations per task. nixie switches
  auto-mode on only when it meets that bar.
- **Owner messages into a running task** (about 1 hour, once the model account has quota): run the 6
  commands in the [owner input spike](../../spikes/sdk-owner-input/README.md#untested), which cover
  a `now` message during a reply with no tool running, a tool that cannot move to the background, a
  message with no priority, `shouldQuery: false`, and `interrupt()` with a queued message. The
  scripts are written and have not run. The answers confirm or change the default in
  [the client](./channels/client.md#messages-into-a-running-task).
- **The Expo client on Android** (about 1 day, with an Android device or emulator): run the
  [typed API spike](../../spikes/client-rpc/README.md) client inside an Expo SDK 57 app, and check
  that `expo/fetch` streams the live view and resumes after the phone sleeps. In the same app, check
  [paste span](../../spikes/paste-spans/README.md) capture with a native paste hook, a keyboard
  clipboard suggestion, swipe typing, autocorrect and voice typing.
- **A Telegram notice round trip** (about 2 hours, with a bot the owner registers): pair a chat with
  a `/start` code, send a content-free notice with a link button, edit it in place, and check that a
  message from a second account gets only a refusal record. It needs a bot token, a new credential,
  under [the channel adapter](./channels/channel-adapter.md#the-push-notifier).
- **Routing quality** (about half a day): replay a scripted day of owner messages against a set of
  tasks and count the messages the conversation routes wrongly, with the move records from
  [the live view](./channels/live-view.md#routing-marks) as the measure in real use. A misrouted
  message fails quietly under [0018](../decisions/0018-main-thread-and-tasks.md).
- **Paste spans in WebKit** (about 1 hour, on a host with WebKit's libraries or a Mac): rerun the
  [paste span spike](../../spikes/paste-spans/README.md) in WebKit, which failed to launch where the
  spike ran.
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
- **The Google web OAuth return** (about 1 hour, needs access to the owner's Google project):
  register the actual private-network HTTPS callback on a Web application OAuth client and complete
  consent. The agreed route is automatic HTTPS return under
  [0030](../decisions/0030-connectors-and-sandbox-environments.md); the spike's Desktop client does
  not validate it. Check Microsoft's redirect when its connector is selected.
- **Microsoft Graph and iCloud** (about half a day and about 2 hours): consent to mail and calendar
  scopes with a personal Microsoft account in a free Azure directory, and read iCloud mail, events
  and contacts with one app-specific password. Run them when a connector for either provider is
  next, under [0019](../decisions/0019-connector-authorization.md).
- **Model requests through a counting proxy** (about half a day, on an imp host): route the model
  requests of a worker imp from imp's broker through a proxy on the host that counts tokens and
  refuses requests once a budget is spent. It checks the hard spending stop that the
  [budgets design](./policy/budgets.md#the-hard-spending-stop) sets under 0028, and needs a check
  that the broker can forward to a host proxy without opening the guest a second route.
- **Model cost on a subscription token** (about 2 hours, with model calls): record what the SDK
  reports per turn on a subscription token against a metered key, and set the deployment budget
  defaults in the [budgets design](./policy/budgets.md#model-cost) from real use.
- **The consent checker on real messages** (about half a day, with model calls): run a checker model
  over owner messages the owner writes, each paired with an action that the message does or does not
  ask for, and measure how often it credits consent wrongly or misses it. It firms up the consent
  stage in the [decision point](./policy/decision-point.md#destination-limits).

## Phase 3 design tasks

- **The terminology pass.** The terms in [0018](../decisions/0018-main-thread-and-tasks.md), such as
  main thread, task and worker, are provisional, and a terminology pass settles them before any
  code. It may draw on a metaphor such as the chief of staff.
- **The durable layer.** nixie owns leases, durable timers, retries, wake-ups and a run viewer, each
  with crash tests ([0001](../decisions/0001-durable-layer.md)), and [tasks](./core/tasks.md)
  designs them. The crash tests confirm that a resumed turn never repeats an outside action that
  ran, and the estimate of 800 to 1,500 lines is untested.
- **A budget for paid tool calls.** A search on Kagi costs about $0.012
  ([0014](../decisions/0014-search.md)), and the budgets in the policy design count `spend` tools
  and model cost only. A budget kind for tool calls that cost money without the `spend` effect would
  let the owner cap search and similar services.
- **Upgrades on the host.** A merged upgrade reaches the host by a webhook, a poll from the host, or
  the owner running one command, and a poll needs no inbound route
  ([0020](../decisions/0020-deployment.md)). The seeding conflict view and the export of runtime
  rules as a pull request are part of the same design.

## Later stages

- **A container sandbox adapter.** The first build implements imp. The
  [container sketch](./connectors/sandbox-adapter.md#a-container-adapter-sketch) checks the common
  interface without a second implementation. A container adapter needs its injecting proxy, tool
  relay, egress gateway, disk quota backend and isolation checks before it supports any run. Memory
  sleep stays unavailable unless a checkpoint implementation proves the same semantics.

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
  ([0012](../decisions/0012-high-risk-approvals.md)). Under 0012, an "always allow" takes the
  passkey too, because it widens a rule. The 0012 design weighs a proposed exemption: a rule no
  wider than the card's own action, with the same tool and the same destination, stays one tap, and
  a broader rule asks for the passkey ([0029](../decisions/0029-channels-and-clients.md)).
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
- **Native push for the Android app.** The app in tier 2 receives the same content-free notice as
  the Telegram notifier, through Expo's push service or Firebase Cloud Messaging directly, with a
  notification action that requires a device unlock
  ([the channel adapter](./channels/channel-adapter.md#room-for-later-channels)). The notice holds
  no content, so a relay learns only that something waits; the Android app's design picks the route.
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
  later deployment cannot use the agreed reverse-forward route. The transport spike passed, under
  [0030](../decisions/0030-connectors-and-sandbox-environments.md).
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
