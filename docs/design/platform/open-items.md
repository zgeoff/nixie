# Open items

This doc holds the choices that need you, the later stages and the changes that imp could take on.
Spikes and design tasks live in the Linear project that this doc links. A decision record or a
design doc links an item here instead of restating it.

## Choices that need you

- **The voice stack.** The default is a pipeline of speech-to-text, nixie's own turn and
  text-to-speech. A speech-to-speech model replaces it if the pipeline's reply time rules it out.
  The [first-token spike](spikes/sdk-first-token/) puts a pipeline reply about 2 s after you stop
  speaking, and the speech-to-speech route is the expected winner. Voice is essential but not in the
  first build ([0009](../../decisions/0009-first-channel.md)).
- **Approval during a voice call.** A spoken yes is a chat message, so it never counts as an
  approval ([0002](../../decisions/0002-approvals.md)). The options are a route to the card during
  the call, or a proposal that waits until the call ends. Recommendation: the card, pushed to the
  screen you are on.
- **Dictated text as evidence.** A voice client sends transcribed words with a `dictated` span
  source, and the quote check counts only `typed` text ([memory writes](memory/writes.md)). The
  options are to count dictated words as evidence, or to make every dictated memory a proposal.
  Recommendation: proposals, because a transcript can mishear a name or a number.
- **The encoder model and library.** Local embeddings are in the first build
  ([0031](../../decisions/0031-memory-capture-context-and-removal.md)). Compare quality, runtime,
  memory use and packaging of pinned assets, then choose before implementation.
- **The passkey for a narrow "always allow".** Under
  [0012](../../decisions/0012-high-risk-approvals.md) an "always allow" takes the passkey once 0012
  ships, because it widens a rule. Recommendation: a rule no wider than the card's own action, with
  the same tool and the same destination, stays one tap, and a broader rule asks for the passkey.
- **A budget for paid tool calls.** A Kagi search costs money without the `spend` effect
  ([0014](../../decisions/0014-search.md)), and budgets count only `spend` tools and model cost. The
  option is a budget kind for paid tool calls. Recommendation: add it with the first paid tool.
- **The data recovery bound.** Hourly key snapshots leave new encrypted content without a key for up
  to an hour, so the offsite replica cannot recover it alone. The candidate is a key snapshot
  triggered by each key change and debounced
  ([backup and restore](deployment/backup-and-restore.md)). No recovery bound holds until data and
  keys restore together.

## Spikes and design tasks

Spikes and design tasks are tracked in the
[nixie Linear project](https://linear.app/zgeoff/project/nixie-caa59289fb88), grouped by the
[slice](slices.md) that needs them, with the items that block slice 1 in their own milestone. Each
spike's evidence stays in its README under `spikes/`.

## Later stages

- **A container sandbox adapter.** The
  [container sketch](connectors/sandbox-adapter.md#a-container-adapter-sketch) checks the common
  interface. A built adapter needs its injecting proxy, tool relay, egress gateway, disk quota and
  isolation checks, and memory-preserving sleep stays unavailable without a checkpoint
  implementation.
- **Taint per job run, auto-mode checks on free-text replies, an outbound URL check, and typed
  workers** ([0015](../../decisions/0015-taint-scope.md)). The first build records the source of
  every tool result so each stage can follow.
- **The passkey check for the always-ask set**
  ([0012](../../decisions/0012-high-risk-approvals.md)).
- **Supervised agents in the live view.** Coding sessions started through atc show in the live view,
  labelled as supervised. Managing atc sessions is a high priority; showing them is a low one
  ([0018](../../decisions/0018-the-conversation-and-tasks.md)).
- **One-tap memory review** from a notice such as "nixie stored 3 memories"
  ([0011](../../decisions/0011-memory-writes.md)).
- **Native push for the Android app**, through Expo's push service or Firebase Cloud Messaging
  ([channel adapter](channels/channel-adapter.md#room-for-later-channels)).
- **An iOS build**, which needs the Apple Developer Program
  ([0009](../../decisions/0009-first-channel.md)).
- **A chat app as a full channel**, opt-in where you accept the storage
  ([0009](../../decisions/0009-first-channel.md)).
- **More search providers** behind the search tool ([0014](../../decisions/0014-search.md)).

## Candidate imp changes

Each item is a change imp could take on where it fits imp's design. nixie designs around imp's
current behaviour until then.

- **A method and path filter on each grant**, for narrow grants to untainted work
  ([0007](../../decisions/0007-grants-and-taint.md),
  [imp broker spike](spikes/imp-broker/README.md)).
- **Token refresh in the broker.** nixie's credential store refreshes tokens on the host and pushes
  each new value into imp until then ([credentials](connectors/credentials.md)).
- **Port-level allow entries**, needed only if a deployment cannot use the reverse-forward route
  ([sandbox adapter](connectors/sandbox-adapter.md#the-route-to-nixies-tools)).
- **A fuller audit** that records refused requests, so the broker's log can feed nixie's record
  ([0007](../../decisions/0007-grants-and-taint.md)).
- **A warm template**, taken after a warm-up turn with entropy and identity reseeded on restore, to
  skip the 2 s of cold reads the [imp worker spike](spikes/imp-worker-start/README.md) measured
  ([tasks](core/tasks.md#workers)).
- **Page cache kept across sleep** for long-lived imps. It costs larger snapshots and more host
  memory, and its benefit is unmeasured.
