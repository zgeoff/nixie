# Slices

nixie's first build ships as 9 slices in order. A slice is a thin path through nixie from end to
end, and it ships once every acceptance check has its evidence: a named test, a recorded run or a
live check. Each later slice extends the ones before it and never rewrites them. The scope of every
slice comes from the first-build split in each design, and the later stages in
[open items](./open-items.md) follow the last slice.

A slice also builds anything that every record carries from the first one, because a later slice
cannot add it to records that already exist. Slice 1 is therefore wider than its one path: it builds
record encryption, the snapshot hash and paste spans as well.

1. [The first conversation](#1-the-first-conversation)
2. [Tasks, workers and the dashboard](#2-tasks-workers-and-the-dashboard)
3. [Policy, approvals and spending](#3-policy-approvals-and-spending)
4. [Memory](#4-memory)
5. [Backup, restore and upgrades](#5-backup-restore-and-upgrades)
6. [Google](#6-google)
7. [Jobs and the live view](#7-jobs-and-the-live-view)
8. [Code and coding sessions](#8-code-and-coding-sessions)
9. [The Android app](#9-the-android-app)

## 1. The first conversation

**Goal:** you sign a browser in with an enrolment code, chat with nixie, and it reads a web page for
you.

**Scope:**

- The deployment on Kubernetes: nixie as a one-replica StatefulSet on a `ReadWriteOnce` volume, the
  web client as a Deployment, one ingress with the `/rpc` path rule, and impd on the node outside
  the cluster ([Kubernetes](./deployment/deployment.md#kubernetes)). nixie decrypts the secrets file
  in its own process ([secrets](./deployment/deployment.md#secrets)), and the Compose recipe runs
  the same images for local and development use.
- The web client on Start, the oRPC contract with its live stream, device sessions and paste spans
  on every message ([the client](./channels/client.md)).
- The event log with record encryption, the key store, projections and the snapshot hash on every
  record ([event log](./core/event-log.md)).
- The conversation as a task: states, inbox, leases, waits for your messages and timers, steps and
  crash recovery ([tasks](./core/tasks.md)). Routing to other tasks waits for slice 2.
- The action queue's attempts, outcomes and retry schedule ([actions](./core/actions.md)). Approval
  consumption and reconciliation wait for slice 3.
- The decision point's registry and scope stages, and one fixed rule in code that allows a call
  whose effects are only `read`, `fetch` or `note`, so the routing tools from slice 2 run without a
  prompt. This subset is this plan's split. Slice 3 builds the full
  [pipeline](./policy/decision-point.md#the-pipeline) and replaces the fixed rule with your seeded
  rules.
- The path definitions source and a seed of the persona, which the snapshot hash covers
  ([definitions source](./connectors/definitions-source.md)). Rule seeding waits for slice 3.
- The sandbox adapter on imp, the model credential grant, the reverse forward and the tool endpoint
  per task run ([sandbox adapter](./connectors/sandbox-adapter.md), [tools](./connectors/tools.md)).
- The conversation in its long-lived imp, on model profiles: the profile config with one profile,
  mapped to the conversation role only. The conversation runs on its configured profile through the
  Agent SDK.
- One read-only tool: a web fetch that declares `fetch` and no destination, runs on the host,
  refuses private, loopback and link-local addresses, and returns the page as outside content.
- The health endpoints, JSON logs of envelope fields only, and the release pipeline that publishes
  the nixie, web and conversation images
  ([health](./deployment/deployment.md#health-and-monitoring),
  [the image](./deployment/deployment.md#the-image)).

**Out of scope:** other tasks, workers and the dashboard, which slice 2 adds.

**Depends on:** nothing.

**Before it starts:** the reverse forward from a pod spike, and the durable layer's crash tests and
the release pipeline, both design tasks in [open items](./open-items.md#design-tasks).

**Acceptance:**

- [ ] A live check on a Kubernetes node: you enrol a browser, send a message, and get a reply that
      used the web fetch, with each step in the event log.
- [ ] A live check rolls the StatefulSet to a new digest, and the old pod stops before the new pod
      opens the database.
- [ ] Session tests port the checks of the
      [session forwarding spike](../../spikes/start-session-forwarding/README.md): a single-use
      enrolment code, a revoked session refused, and Start holding no cookie or state.
- [ ] The durable crash tests pass in CI: lease expiry, a timer due while nixie was down, a retry, a
      wake-up and a crash mid-turn. A test-only queued action shows that a resumed task run never
      repeats an action that ran.
- [ ] A CI test drops every projection, folds the recorded log, and matches the live tables.
- [ ] A test finds no message text in plain form in `nixie.db` or in the logs, and finds the
      snapshot hash on every record.
- [ ] Tests port the isolation control of the
      [reverse-forward spike](../../spikes/tools-reverse-forward/README.md): the conversation imp
      reaches nixie's tools and the model API, and nothing else.
- [ ] A test asserts the options of every `query()`: `tools: []`, `settingSources: []` and the SDK's
      own memory off.
- [ ] A tagged release publishes the 3 images to GHCR, and both the Kubernetes deployment and the
      Compose recipe run them pinned by digest.

## 2. Tasks, workers and the dashboard

**Goal:** you hand nixie work that runs as its own task, watch it on the dashboard, and step in.

**Scope:**

- Routing with its 2 tools, routing records, routing marks and the move action
  ([routing](./core/tasks.md#routing-from-the-conversation),
  [routing marks](./channels/live-view.md#routing-marks)).
- Pause, stop, close and interrupt ([pause, stop and close](./core/tasks.md#pause-stop-and-close),
  [stepping in](./channels/live-view.md#stepping-in)).
- Messages into a running task at the `next` priority
  ([messages into a running task](./channels/client.md#messages-into-a-running-task)).
- The dashboard and a task opened as a conversation
  ([the dashboard](./channels/live-view.md#the-dashboard)).
- Workers, each in its own imp from the worker image, with the worker role mapped to a model
  profile, the worker run limits and the runner pools ([workers](./core/tasks.md#workers),
  [runner pools](./core/actions.md#runner-pools)).

**Out of scope:** proposals and every action that needs your approval, which slice 3 adds.

**Depends on:** slice 1, whose core and sandbox adapter every task and worker runs on.

**Before it starts:** the worker cold start and sandbox under load spikes. The routing quality spike
runs during the slice.

**Acceptance:**

- [ ] A recorded run: the conversation starts a task, the task starts a worker that fetches a page,
      and the task reports back.
- [ ] Tests for a misroute and its move, with the correction record and both inboxes updated in one
      transaction.
- [ ] Tests for pause, stop and close at each task state, and for a worker run that hits each of its
      limits.
- [ ] A crash test shows that recovery destroys the imp of a worker whose step no longer runs.
- [ ] A test reconnects the live stream mid-task and receives exactly the records it missed.

## 3. Policy, approvals and spending

**Goal:** nixie acts outside only where your rules or your own message allow it, asks through a card
you answer with one tap, and stops at your spending limits.

**Scope:**

- The full decision point: effects, the always-ask set, destination limits and the consent checker
  ([decision point](./policy/decision-point.md)).
- Rules in YAML, seeding with your confirmation of each widening, the widening check, proposed
  rules, mandates and the starter rule set ([rules](./policy/rules.md),
  [seeding](./deployment/deployment.md#seeding-the-definitions)).
- Proposals, the approval record, "always allow" and the approval digest
  ([proposals and approvals](./policy/approvals.md)), with cards, Defer and the server's check in
  the client ([approvals in the client](./channels/approvals.md)).
- Approval consumption, policy before each attempt, reconciliation and unknown outcomes
  ([actions](./core/actions.md)).
- Budgets, lifts for `spend` and the hard spending stop as a counting proxy
  ([budgets](./policy/budgets.md)). Model profiles gain their price table, and the model limits
  count dollars, tokens and turns, each with a generous default that config overrides. The consent
  checker role maps to a model profile.
- The Telegram push notifier ([channel adapter](./channels/channel-adapter.md)).
- Search on Kagi, the first paid tool, with the credential store's deployment backend and fetcher
  for its key ([search](./connectors/connector.md#search),
  [credentials](./connectors/credentials.md#backends)).

**Out of scope:** auto-mode, which stays off until its spike meets the bar, and the passkey check, a
later stage.

**Depends on:** slice 2, because a proposal belongs to a task, and stopping a task withdraws its
proposals.

**Before it starts:** the spending proxy, the model cost on a subscription token, the consent
checker on real messages, the second guard on the mod and the Telegram round trip spikes, and the
seeding conflict view and rule export design task. Your choice: a budget for paid tool calls.

**Acceptance:**

- [ ] The scripted scenarios of the [policy rules spike](../../spikes/policy-rules/README.md) run in
      CI against the starter rule set with no unexpected prompt.
- [ ] A replay test rebuilds every decision from its record and its snapshot.
- [ ] Tests answer a proposal with a stale action hash, a defer that returns after its proposal
      lapsed, and each reconciliation path.
- [ ] Tests trip each model limit, and show that the counting proxy refuses requests once a budget
      is spent and while the proxy is down.
- [ ] A test sends to a new destination through a test-only `send` tool: a card shows, "always
      allow" adds its rule, and the next send runs with no prompt.
- [ ] A live check: a pending card makes Telegram show a notice that holds only a count and a link.

## 4. Memory

**Goal:** nixie remembers what you tell it, shows you every item with its source, and retires or
forgets an item on your word.

**Scope:**

- The memory store's first build: items, versions, a key per item, recall, the memory view, retire,
  forget, bulk deletion and export ([memory store](./memory/store.md#the-first-build)).
- Conversation writes and the batched writer behind the content gate, memory proposals and grouped
  notices ([memory writes](./memory/writes.md)). The memory writer role maps to a model profile.
- The prompt, the pinned core, retrieval, `log.search`, compaction, the transcript as a cache and
  the session rebuild ([memory in context](./memory/context.md)).

**Out of scope:** consolidation, and the forget cleanup of key backups, which slice 5 adds.

**Depends on:** slice 3, because memory proposals join the approval digest.

**Before it starts:** the compaction controls, resume after compaction, session recovery, memory
checker, retrieval on your own questions, batched capture, memory poisoning, retirement and bulk
deletion, pinned core on the conversation's configured profile, and paste spans in WebKit spikes.
Your choice: the encoder model and library. Your input: the questions for the retrieval spike, about
memory items you recognise.

**Acceptance:**

- [ ] Tests run the quote check and the token check over the cases of the
      [memory checks spike](../../spikes/memory-checks/README.md).
- [ ] A replay of poisoned email through a worker produces only proposals, each with outside content
      as its source.
- [ ] A forget test shows the key gone, every live session rebuilt, every stored summary deleted and
      every index entry removed.
- [ ] A crash test kills the batched writer before and after publication, and no write repeats.
- [ ] A recorded run of the [retrieval spike](../../spikes/memory-retrieval/README.md) on your own
      questions, with the configured encoder.

## 5. Backup, restore and upgrades

**Goal:** a lost host restores from its backups, and an upgrade or a rollback by one release is one
merged pull request.

**Scope:**

- Hourly restic snapshots to the data repo and the key repo, and the forget cleanup of key backups
  ([backup and restore](./deployment/backup-and-restore.md)).
- Restore onto a new Kubernetes volume or host, with recovery holds
  ([recovery holds](./core/tasks.md#recovery-holds)).
- Upgrades and rollbacks as a change of the pinned digest in the deployment repo, on Kubernetes or
  Compose, with migrations that the release before can read ([upgrades](./deployment/upgrades.md)).
- The backups part of readiness, and its push notice.

**Out of scope:** the offsite replica and `nixie rollback`, both later stages.

**Depends on:** slice 4, because a forget completes only once the key repo prunes.

**Before it starts:** the deployment on a real host and the rollback across actions spikes.

**Acceptance:**

- [ ] A recorded restore onto a fresh Kubernetes volume from the 2 repos, the deployment repo and
      the recovery key, with recovered tasks held.
- [ ] A test shows a forgotten item stays unreadable against every older data snapshot.
- [ ] A CI test runs the release before against the newer schema, reading and writing.
- [ ] A live check: an upgrade and its revert, each as a merged pull request, with no write lost.

## 6. Google

**Goal:** nixie reads, labels and sends your mail and manages your calendar and Drive files, asking
where your rules say to.

**Scope:**

- The connector interface and setup with the web OAuth return
  ([connectors](./connectors/connector.md)).
- The credential store's database backend, refresh, statuses, Disconnect and Forget
  ([credentials](./connectors/credentials.md)).
- Gmail, Google Calendar and Google Drive, with reconciliation through the Sent folder
  ([Google](./connectors/connector.md#google)).
- Polls through the trigger source, which wake a task that waits for a reply
  ([polls](./channels/trigger-source.md#polls)).

**Out of scope:** other providers, which the Microsoft Graph and iCloud spikes open.

**Depends on:** slice 3 for destination limits and reconciliation, and slice 5 for the backup
cleanup on Forget.

**Before it starts:** the Google refresh on day 8 and the Google web OAuth return spikes.

**Acceptance:**

- [ ] A live check: you register a client, consent, and nixie sends a mail that you approved on a
      card.
- [ ] A test gives a send an unknown outcome, and the Sent-folder check settles it.
- [ ] Crash tests for a refresh that rotates its token, and for a fetch that races a disconnect.
- [ ] A test replays a Gmail poll and starts no second job run or wake-up.

## 7. Jobs and the live view

**Goal:** your scheduled jobs run, such as a morning report, and you see what every finished task
did and why.

**Scope:**

- Schedules, job runs with their trigger details, catch-up and skip
  ([schedules](./channels/trigger-source.md#schedules), [job runs](./core/tasks.md#job-runs)).
- Job notices with undo, and the rules for creating jobs ([jobs](./policy/rules.md#jobs)).
- The live view: finished tasks, the report of skipped or late triggers, and raw records
  ([the live view](./channels/live-view.md)).

**Out of scope:** webhooks and streams, which a deployment turns on later.

**Depends on:** slice 3, because every job run starts untrusted under the destination limits, and
slice 6 for jobs that read mail and calendar.

**Before it starts:** nothing.

**Acceptance:**

- [ ] Tests for catch-up within half the interval, a skip beyond it, and a daylight saving change.
- [ ] A test undoes a job notice and restores the old definition.
- [ ] A live check: a morning report runs on schedule and reads your calendar and mail.

## 8. Code and coding sessions

**Goal:** nixie runs code in a sandbox for you, and starts and steers atc coding sessions as tasks.

**Scope:**

- The code tool and the code image ([coding](./connectors/coding.md#the-code-tool)).
- The MCP proxy: pinning, effect declarations and authorization
  ([MCP proxy](./connectors/mcp-proxy.md)).
- The atc adapter over the proxy ([the atc adapter](./connectors/coding.md#the-atc-adapter)).

**Out of scope:** the built-in coding adapter and supervised agents in the live view, both later
stages.

**Depends on:** slice 3, because your rules decide every code run and every session start and
message.

**Before it starts:** the code environment and input requests on retry spikes.

**Acceptance:**

- [ ] A test shows that a code run has no egress and no grant.
- [ ] A test changes a pinned tool's description, and the proxy stops the tool until you allow it.
- [ ] A test retries an atc spawn with its key and gets the first answer.
- [ ] A live check: you ask for a coding session, and it shows as a task you can message.

## 9. The Android app

**Goal:** you talk to nixie and answer approvals from your phone.

**Scope:**

- The Expo app on the shared package, with `expo-secure-store` sessions and verified App Links
  ([two clients, one contract](./channels/client.md#two-clients-one-contract),
  [deep links](./channels/client.md#deep-links)).
- The native paste module from the app's first build
  ([paste spans](./channels/client.md#paste-spans)).

**Out of scope:** native push and an iOS build, both later stages.

**Depends on:** slice 3, because you approve cards in the app.

**Before it starts:** the Expo client on Android and the keyboard clipboard chips spikes.

**Acceptance:**

- [ ] A recorded run of the [typed API spike](../../spikes/client-rpc/README.md) in the app, with
      the stream resumed after the phone sleeps.
- [ ] Tests label pasted, swiped and autocorrected text the way the paste span rules require.
- [ ] A live check: a push link opens a card in the app, and you approve it.
