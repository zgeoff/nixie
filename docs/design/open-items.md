# Open items

Everything the design baseline leaves open lives here: choices that need you, spikes that check a
claim, design tasks, later stages and changes that imp could take on. A decision record or a design
doc links an item here instead of restating it.

## Choices that need you

- **The voice stack.** The default is a pipeline of speech-to-text, nixie's own turn and
  text-to-speech. A speech-to-speech model replaces it if the pipeline's reply time rules it out.
  The [first-token spike](../../spikes/sdk-first-token/) puts a pipeline reply about 2 s after you
  stop speaking, and the speech-to-speech route is the expected winner. Voice is essential but not
  in the first build ([0009](../decisions/0009-first-channel.md)).
- **Approval during a voice call.** A spoken yes is a chat message, so it never counts as an
  approval ([0002](../decisions/0002-approvals.md)). The options are a route to the card during the
  call, or a proposal that waits until the call ends. Recommendation: the card, pushed to the screen
  you are on.
- **Dictated text as evidence.** A voice client sends transcribed words with a `dictated` span
  source, and the quote check counts only `typed` text ([memory writes](./memory/writes.md)). The
  options are to count dictated words as evidence, or to make every dictated memory a proposal.
  Recommendation: proposals, because a transcript can mishear a name or a number.
- **The model per job.** The [model-eval spike](../../spikes/model-eval/README.md) suggests
  different models for chat, memory writing, tool calls and long background reasoning, with low
  reasoning effort for chat. Its 2 samples per cell make the numbers indicative only. The memory
  writer's candidates are open too.
- **The encoder model and library.** Local embeddings are in the first build
  ([0031](../decisions/0031-memory-capture-context-and-removal.md)). Compare quality, runtime,
  memory use and packaging of pinned assets, then choose before implementation.
- **The passkey for a narrow "always allow".** Under
  [0012](../decisions/0012-high-risk-approvals.md) an "always allow" takes the passkey once 0012
  ships, because it widens a rule. Recommendation: a rule no wider than the card's own action, with
  the same tool and the same destination, stays one tap, and a broader rule asks for the passkey.
- **Budget defaults on a subscription token.** On a subscription token the SDK reports a notional
  cost, so the default daily and monthly budgets could stop nixie in ordinary use
  ([budgets](./policy/budgets.md)). The defaults stay placeholders until the subscription spike
  below sets them.
- **A budget for paid tool calls.** A Kagi search costs money without the `spend` effect
  ([0014](../decisions/0014-search.md)), and budgets count only `spend` tools and model cost. The
  option is a budget kind for paid tool calls. Recommendation: add it with the first paid tool.
- **The data recovery bound.** Hourly key snapshots leave new encrypted content without a key for up
  to an hour, so the offsite replica cannot recover it alone. The candidate is a key snapshot
  triggered by each key change and debounced
  ([backup and restore](./deployment/backup-and-restore.md)). No recovery bound holds until data and
  keys restore together.

## Spikes to run

Spikes that need model calls wait for model quota. Each line names the claim the spike checks.

### Memory and sessions

- **The pinned core on GLM** (minutes): the
  [pinned core spike](../../spikes/sdk-pinned-core/README.md) showed on Haiku that `snapshot: false`
  lets a changed pinned core reach a resumed session. Rerun it on GLM 5.3 to check that the setting
  applies through a non-Anthropic endpoint.
- **Compaction controls** (about 2 hours): check whether returning `decision: 'block'` from the
  `PreCompact` hook stops an automatic compaction. nixie does not rely on it until then.
- **A resume after compaction** (about 2 hours): compact a session after a step's recorded boundary,
  crash the next step, and resume at the boundary with `resumeSessionAt`. The
  [resume-at spike](../../spikes/sdk-resume-at/README.md) left this case untested.
- **Session recovery** (about 1 day): compare a rebuild from the event log with an SDK resume, after
  compaction and after a crash. Check that pending approvals and action outcomes come from canonical
  rows, and that forget removes every invalid transcript copy after its writer stops.
- **The memory checker on real messages** (about half a day): run the checker over messages you
  write, each paired with memories it does and does not assert, including negations, questions and
  quoted remarks. Measure wrong confirmations and misses. It shares a run with the consent checker.
- **Retrieval on your own questions** (about half a day): rerun the
  [retrieval spike](../../spikes/memory-retrieval/README.md) with questions you write about memory
  items you recognise. It tunes recall, the encoder and ranking.
- **Batched capture with a model** (about half a day): the [batch spike](../../spikes/memory-batch/)
  checked recovery with fixture output. Measure capture quality, capture delay and input cost with a
  real writer.
- **Memory poisoning** (about half a day): replay poisoned emails through a worker, and confirm that
  every memory write they cause becomes a proposal with untrusted provenance
  ([0011](../decisions/0011-memory-writes.md)).
- **Retirement and bulk deletion** (about half a day): test typed intent against an exact item and
  version, ambiguous references, a restored item after a bulk preview, and crashes between per-item
  key deletions ([memory store](./memory/store.md)).

### Policy and approvals

- **The consent checker on real messages** (about half a day): measure how often the checker credits
  consent wrongly or misses it ([decision point](./policy/decision-point.md)).
- **The spending proxy** (about half a day, on an imp host): route a worker's model requests from
  imp's broker through a counting proxy on the host, and check that the broker opens the guest no
  second route ([budgets](./policy/budgets.md)).
- **Model cost on a subscription token** (about 2 hours): record what the SDK reports per turn on a
  subscription token against a metered key, and set the budget defaults from real use.
- **auto-mode on nixie's scenarios** (effort unknown): run auto-mode against the
  [policy rules spike](../../spikes/policy-rules/README.md) scenarios and measure the bar from
  [0008](../decisions/0008-auto-mode.md). nixie switches auto-mode on only when it meets that bar.
- **A second guard on the mod** (about 2 hours): an SDK `PreToolUse` callback that denies every call
  while the policy mod's command is missing ([0002](../decisions/0002-approvals.md)).

### Channels

- **The Expo client on Android** (about 1 day): run the [typed API spike](../../spikes/client-rpc/)
  in an Expo app, check that the live stream resumes after the phone sleeps, and check
  [paste span](../../spikes/paste-spans/) capture with the native paste hook, swipe typing,
  autocorrect and voice typing.
- **Keyboard clipboard chips** (about 2 hours, after the paste module exists): check Gboard's
  clipboard chips and other insertion paths that bypass the paste hook. They count as unknown until
  tested ([0029](../decisions/0029-channels-and-clients.md)).
- **Paste spans in WebKit** (about 1 hour): rerun the paste span spike in WebKit, which failed to
  launch where the spike ran.
- **Messages into a running task** (about 1 hour): run the 6 untested cases in the
  [message input spike](../../spikes/sdk-owner-input/README.md). They confirm or change the default
  in [the client](./channels/client.md).
- **Routing quality** (about half a day): replay a scripted day of messages against a set of tasks
  and count misroutes, with the move records from [the live view](./channels/live-view.md) as the
  measure in real use. A misrouted message fails quietly
  ([0018](../decisions/0018-the-conversation-and-tasks.md)).
- **A Telegram notice round trip** (about 2 hours, with a bot you register): pair a chat with a
  `/start` code, send and edit a content-free notice, and check that a second account gets only a
  refusal record ([channel adapter](./channels/channel-adapter.md)).

### Connectors and sandboxes

- **The Google refresh on day 8** (minutes, on or after 2026-10-16): run `bun refresh.ts` in the
  [Google OAuth spike](../../spikes/google-oauth/). It shows whether the token outlives testing
  mode's 7-day limit ([0019](../decisions/0019-connector-authorization.md)).
- **The Google web OAuth return** (about 1 hour): register the private-network HTTPS callback on a
  Web application client and complete consent
  ([0030](../decisions/0030-connectors-and-sandbox-environments.md)).
- **The code environment** (about half a day): build the code and worker images with Node.js, Python
  and the common Linux tools, run representative programs, and measure image size.
- **Worker cold start** (about 2 hours): time a fresh worker on the worker image, which carries the
  code runtimes, against the numbers behind
  [0026](../decisions/0026-where-workers-and-the-conversation-run.md): 472 ms to create an imp and
  2.5 to 3 s to first text. A slower start reopens a separate, smaller worker image.
- **The sandbox under load** (about half a day): a long turn under imp's broker with a token
  rotation mid-turn, and parallel tool calls over HTTP MCP
  ([0003](../decisions/0003-sdk-placement.md)).
- **Input requests on retry** (about 1 hour, with the first external server): check how long a
  server keeps an input request valid for a retry ([MCP proxy](./connectors/mcp-proxy.md)).
- **Microsoft Graph and iCloud** (about half a day and 2 hours): run when a connector for either
  provider is next ([0019](../decisions/0019-connector-authorization.md)).

### Deployment

- **A deployment on a real host** (about 1 day): imp beside nixie with images from a manifest, a
  pull by digest from a public registry, a Renovate pull request, restic over a network backend, an
  encrypted disk and a recovery key held off the host ([deployment](./deployment/deployment.md)).
- **A rollback across actions** (about half a day): run actions after an upgrade, roll back with a
  restore, and confirm each action reaches the restored log with its outcome and its task starts
  paused ([upgrades](./deployment/upgrades.md)).
- **The offsite replica and forget cleanup** (effort unknown): test the configured backend with the
  rclone gateway, gateway crashes, stale key publication, backend key cleanup including object
  versions, and a restore after total host loss. The
  [replica encryption spike](../../spikes/replica-encryption/) tested no cloud provider.
- **Kubernetes with imp** (effort unknown): run nixie as a one-replica StatefulSet with impd on the
  node ([deployment](./deployment/deployment.md)).

## Design tasks

- **The durable layer's crash tests.** Leases, durable timers, retries and wake-ups each get a crash
  test that confirms a resumed task run never repeats an action that ran ([tasks](./core/tasks.md)).
- **The seeding conflict view and the rule export.** A seed shows a rule edited at runtime as a
  conflict, and nixie exports runtime rules to the definitions repo as a pull request
  ([0020](../decisions/0020-deployment.md)).
- **The release pipeline.** Versioning, the CI build, registry publishing and signing for the nixie
  image and its imp images, following the usual release-please setup with CI publishing to GHCR.
- **npm packages.** The first build publishes none, and every adapter lives in the monorepo.
  Publishing the interfaces from [0016](../decisions/0016-own-interfaces.md) as a package, for
  adapters outside the repo, is a later stage.

## Later stages

- **A container sandbox adapter.** The
  [container sketch](./connectors/sandbox-adapter.md#a-container-adapter-sketch) checks the common
  interface. A built adapter needs its injecting proxy, tool relay, egress gateway, disk quota and
  isolation checks, and memory-preserving sleep stays unavailable without a checkpoint
  implementation.
- **Taint per job run, auto-mode checks on free-text replies, an outbound URL check, and typed
  workers** ([0015](../decisions/0015-taint-scope.md)). The first build records the source of every
  tool result so each stage can follow.
- **The passkey check for the always-ask set** ([0012](../decisions/0012-high-risk-approvals.md)).
- **Supervised agents in the live view.** Coding sessions started through atc show in the live view,
  labelled as supervised. Managing atc sessions is a high priority; showing them is a low one
  ([0018](../decisions/0018-the-conversation-and-tasks.md)).
- **One-tap memory review** from a notice such as "nixie stored 3 memories"
  ([0011](../decisions/0011-memory-writes.md)).
- **Native push for the Android app**, through Expo's push service or Firebase Cloud Messaging
  ([channel adapter](./channels/channel-adapter.md#room-for-later-channels)).
- **An iOS build**, which needs the Apple Developer Program
  ([0009](../decisions/0009-first-channel.md)).
- **A chat app as a full channel**, opt-in where you accept the storage
  ([0009](../decisions/0009-first-channel.md)).
- **More search providers** behind the search tool ([0014](../decisions/0014-search.md)).

## Candidate imp changes

Each item is a change imp could take on where it fits imp's design. nixie designs around imp's
current behaviour until then.

- **A method and path filter on each grant**, for narrow grants to untainted work
  ([0007](../decisions/0007-grants-and-taint.md),
  [imp broker spike](../../spikes/imp-broker/README.md)).
- **Token refresh in the broker.** nixie's credential store refreshes tokens on the host and pushes
  each new value into imp until then ([credentials](./connectors/credentials.md)).
- **Port-level allow entries**, needed only if a deployment cannot use the reverse-forward route
  ([sandbox adapter](./connectors/sandbox-adapter.md#the-route-to-nixies-tools)).
- **A fuller audit** that records refused requests, so the broker's log can feed nixie's record
  ([0007](../decisions/0007-grants-and-taint.md)).
- **A warm template**, taken after a warm-up turn with entropy and identity reseeded on restore, to
  skip the 2 s of cold reads the [imp worker spike](../../spikes/imp-worker-start/README.md)
  measured ([tasks](./core/tasks.md#workers)).
- **Page cache kept across sleep** for long-lived imps. It costs larger snapshots and more host
  memory, and its benefit is unmeasured.
