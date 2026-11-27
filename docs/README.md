<div align="center">
  <h1>nixie documentation</h1>

  <p>What nixie is, what binds it, what has been decided, and what is still open.</p>

  <p>
    <a href="./overview.md">Overview</a> •
    <a href="./principles.md">Principles</a> •
    <a href="./scope.md">Scope</a> •
    <a href="https://linear.app/zgeoff/project/nixie-caa59289fb88">Planned work</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#design">Design</a> •
    <a href="#decisions">Decisions</a> •
    <a href="#archive">Archive</a> •
    <a href="#spikes">Spikes</a> •
    <a href="../AGENTS.md">Agent Guidelines</a>
  </p>
</div>

## Start here

- [Overview](overview.md) — what nixie is, why it exists, and the design in brief
- [Principles](principles.md) — the rules every task and deployment holds to
- [Scope](scope.md) — requirements in tiers, and non-goals
- [Glossary](glossary.md) — the terms the docs and the code use, one meaning each
- [Planned work](https://linear.app/zgeoff/project/nixie-caa59289fb88) — the nixie project in
  Linear: the slice plan, choices that need you, spikes, design tasks and later stages

`architecture/` holds what is built, with the rules and contracts each part keeps. `design/<work>/`
holds the design for a piece of work that is not built yet: `design/platform/` is the first.
`decisions/` holds the few [decision records](#decisions). Planned work lives in Linear.

## Architecture

- [Architecture overview](architecture/overview.md) — the path of a tool call, the client path, the
  topology, the data and the cross-cutting rules, on one page
- [Code layout](architecture/code-layout.md) — the workspace folders, the packages, the boundary
  tags and import zones, the module packages, and the tests, test builds and checks
- [Ports](architecture/ports.md) — the terms and the 13 rules for ports, providers and adapters, and
  where the code departs from them

### Core

- [The database and the single writer](architecture/core/database.md) — one SQLite file in a worker
  thread, the writer lock and epoch, migrations and the oldest reader
- [The event log](architecture/core/event-log.md) — records, appending, projections and their
  rebuild, and reading by sequence
- [Erasable fields](architecture/core/erasable-fields.md) — a key per record, the key store beside
  the database, and forgetting by destroying a key
- [Tasks](architecture/core/tasks.md) — task states, the inbox and its read cursor, steps and their
  commit, and durable timers
- [Started tasks](architecture/core/started-tasks.md) — the start and its options, the sandbox
  runner, limits and their raise
- [Task messages](architecture/core/task-messages.md) — messages between tasks, the hop limit and
  message waits
- [Leases and the restart sweep](architecture/core/leases-and-restart-sweep.md) — the one claim
  path, lease generations, claim pools, the restart sweep and fault points
- [Pausing nixie](architecture/core/pause.md) — the pause and its records, what it stops, the reader
  gate and the pause after a restore
- [Actions](architecture/core/actions.md) — the action queue, outcomes, attempts, retries and what
  the model sees
- [The definitions](architecture/core/definitions.md) — sources, the content hash, the definitions
  format, the seed checks on skills, the snapshot hash and seeding
- [Model profiles](architecture/core/model-profiles.md) — profiles, the role map, credential
  references and the model on each record
- [Conversation turns](architecture/core/conversation-turns.md) — the guest, what a query holds,
  resume and fork, inbox records as messages
- [Session opening](architecture/core/session-opening.md) — the slots every new session opens with,
  the status registry, the replay over the recent turns and the opening record
- [Compaction](architecture/core/compaction.md) — the compaction step, the summary instruction,
  failure and overflow, the summary record and forgetting
- [Skills](architecture/core/skills.md) — skill lists, the pin a task keeps, and the catalog in the
  system prompt with its cap
- [Prompts](architecture/core/prompts.md) — the built-in prompts, their parts and templates,
  overrides from the definitions, the operator log line for a dropped safety part, and the checker
  hashes in the policy
- [Coding tasks](architecture/core/coding-tasks.md) — the bound coding session, starting or joining
  one, and the steps that move text and events between the task and the session
- [The assistant's mailbox](architecture/core/mailbox.md) — the mail host, the stored mail, the
  tools that read it and the wake rules that decide which mail wakes the conversation
- [Reminders](architecture/core/reminders.md) — what a reminder holds, its tools and how a fire
  wakes the conversation
- [Triggers](architecture/core/triggers.md) — what a source hands over, the trigger core that takes
  each fire once, and which definitions can fire
- [Crash tests](architecture/core/crash-tests.md) — the test build, the harness link and its clock,
  the scripted model, the provider double and the oracle
- [The Agent SDK contract suite](architecture/core/sdk-contract-suite.md) — the SDK behaviours nixie
  relies on, checked against a stub model on every pull request and against the model on every SDK
  bump

### Policy

- [The decision point](architecture/policy/decision-point.md) — the stages, the fixed read-only
  rule, effect declarations and the test rule
- [Rules](architecture/policy/rules.md) — the rule format, matching, evaluation, rendering and the
  widening check
- [Rule conditions](architecture/policy/rule-conditions.md) — the CEL subset, its check, evaluation
  and the card
- [The model gateway](architecture/policy/model-gateway.md) — routes, the count and its store, the
  spending limit and the refusals
- [Metering](architecture/policy/metering.md) — the one helper for periods, the one source of each
  price and the spend ledger
- [The spending stop](architecture/policy/spending-stop.md) — the stop's states, the watcher, the
  check before a turn, the raise and the notice
- [The turn-input log](architecture/policy/turn-input-log.md) — the capture of a step, the intake,
  the removals and the reading
- [Approvals](architecture/policy/approvals.md) — the one proposals table and the one lifecycle
  every proposal that waits for the user follows
- [Budgets](architecture/policy/budgets.md) — the budget format, the budgets in force and the check
  before a paid call goes out
- [Passkeys](architecture/policy/passkeys.md) — the passkeys table and which answers take a passkey

### Connectors

- [Tool calls](architecture/connectors/tool-calls.md) — one endpoint per run, tool definitions, the
  call steps, and the records of each call
- [Sandboxes](architecture/connectors/sandboxes.md) — kinds of work, records and the restart sweep,
  the tool route, the imp adapter and the test sandbox
- [Memory kills](architecture/connectors/memory-kills.md) — the read of a guest's count of memory
  kills, and the log line for each kill
- [MCP proxy](architecture/connectors/mcp-proxy.md) — outside MCP servers, their facts and
  approvals, sign-in, pinned tools and the registry
- [Web fetch](architecture/connectors/web-fetch.md) — the fetch sandbox, the fetcher's address
  checks, the limits and the result
- [Web fetch images](architecture/connectors/web-fetch-images.md) — a fetched image as image
  content, its limits, and how the host downscales it
- [The code tool](architecture/connectors/code-tool.md) — `code.run`, its fresh sandbox, the limits,
  the files it writes and how a forget destroys its sandbox
- [The computer](architecture/connectors/computer.md) — the assistant's browser and shell, their
  disks, the tools, the checking proxy and the approval of a command
- [Time](architecture/connectors/time.md) — the time zone on each message, and the time tool that
  answers in the user's newest zone
- [Images](architecture/connectors/images.md) — drawing and editing pictures in passes, the provider
  profiles, the charge and the stored attempts
- [Search](architecture/connectors/search.md) — the search tool on the host, its daily call cap, the
  Kagi provider and its key
- [The atc adapter](architecture/connectors/coding-atc.md) — the gateway calls behind a coding
  session, its states and replies, the coding source and the supported gateway versions

### Channels

- [The client](architecture/channels/client.md) — the oRPC contract, session forwarding, the
  conversation view, the outbox and paste spans
- [The API](architecture/channels/api.md) — device sessions and the identity record, checked
  actions, refusals, message sends and the live stream
- [Live updates](architecture/channels/live-updates.md) — the one stream of each tab, its topics and
  the client registry
- [Devices](architecture/channels/devices.md) — enrolling a device, its scoped session, the screen
  and the tools that put pictures on it

### Memory

- [The memory store](architecture/memory/store.md) — items and versions, the 4 states, changes bound
  to a version, a key per item, recall with its index and delivery lock, forgetting, and the model's
  tools
- [Memory writes](architecture/memory/writes.md) — the content gate and its quote, token and checker
  checks, retirement intent, provenance, memory proposals and notices
- [The memory view](architecture/memory/view.md) — lists by state, search, the pinned core against
  its budget, each version's provenance and evidence, and changes bound to a version
- [Memory export](architecture/memory/export.md) — every item with its history in one versioned JSON
  file, streamed as a checked action and saved where the user picks, and the denied export tool
- [Moments](architecture/memory/moments.md) — kept spans of a thread with a title, a note and
  reflections, the tools that keep and read them a page at a time, the weekly count, and a destroy
  that shreds only the moment's own text
- [Memory in context](architecture/memory/context.md) — the pinned core in the system prompt, the
  items each turn retrieves, and the session cleanup a forget runs
- [The memory checker eval](architecture/memory/checker-eval.md) — the labelled sets, wrong
  confirmations and misses, and the results per set

### Deployment

- [The server](architecture/deployment/server.md) — configuration and secrets, the start sequence,
  health per part, envelope-only logs, stopping and the nixie image
- [Deployment configuration](architecture/deployment/configuration.md) — the YAML file, what it
  holds, its schema and credential references, and how it is mounted
- [Host commands](architecture/deployment/host-commands.md) — the nixie command on the image's PATH,
  the commands a deployment runs, the control socket, sessions, the reset, backup and restore, and
  memory
- [Names in impd](architecture/deployment/impd-names.md) — the names of nixie's imps, sandbox images
  and model secrets, the token's pattern, and why the sandbox images stay public
- [The release pipeline](architecture/deployment/release-pipeline.md) — versions, the release
  stages, the sandbox manifest, publishing, attestations and the compatibility checks
- [Kubernetes](architecture/deployment/kubernetes.md) — the reference manifests, nixie's pod and its
  mounts, impd and the address ranges, and the ingress
- [Backups](architecture/deployment/backups.md) — snapshot sets, the backup job and its 2 restic
  repositories, receipts, and the shared formats
- [The backup pair](architecture/deployment/backup-pair.md) — the snapshot tags, the newest key
  snapshot, and how the fetch picks a data snapshot that its keys can read

## Guides

- [Vendoring a skill](guides/vendoring-a-skill.md) — copy a published skill into your definitions at
  a pinned commit, compute its content hash and add its lock entry
- [Overriding a prompt](guides/overriding-a-prompt.md) — replace a part or the template of a
  built-in prompt from your definitions, and the parts and paths each prompt has
- [Consolidating memory with a task](guides/consolidating-memory-with-a-task.md) — add a weekly task
  that merges, rewrites or retires memory items, from an example folder
- [Taking notes with a task](guides/taking-notes-with-a-task.md) — add a daily task that saves the
  facts in your messages as memories, from an example folder
- [Connect a Google account](guides/google.md) — make a Google Cloud OAuth client, register it,
  connect an account, and forget it
- [Connect an MCP server](guides/mcp-servers.md) — add a server to the config, register nixie on it,
  sign in, and allow its tools
- [Run nixie with Docker Compose](guides/compose.md) — the reference recipe, its placeholders and
  secrets, signing in, and how CI checks it
- [Run nixie on Kubernetes](guides/kubernetes.md) — the reference manifests, their placeholders and
  secrets, and validating them

## Runbooks

- [Releasing](runbooks/releasing.md) — the release App, cutting a release, making a sandbox image
  public, checking an attestation and repairing a failed release
- [Upgrade and roll back](runbooks/upgrades.md) — move the nixie, web and backup pins in one pull
  request, deploy in order, and revert
- [Run a preview](runbooks/preview.md) — a throwaway nixie for one pull request, signing in, and its
  model calls
- [Check a turn on a preview through the API](runbooks/preview-api-check.md) — enrol a device, send
  one turn and read the records it wrote, then reset the preview
- [Run the memory checker eval](runbooks/memory-checker-eval.md) — score a set through the
  production checker and check its report
- [Run the Agent SDK contract suite](runbooks/sdk-contract-suite.md) — run the probes against the
  model on an imp for each Agent SDK bump, and act on one that fails
- [Run the imp isolation tests](runbooks/imp-isolation-tests.md) — what a conversation imp and a
  fetch sandbox reach, on a host with impd
- [Evidence lanes](runbooks/evidence-lanes.md) — the lanes that check a build with no turn sent to
  production, and the read paths of a production deployment

## Design

Each design states its contracts, marks what the first build implements, and links the decisions it
rests on.

- [Slice plan](https://linear.app/zgeoff/document/slice-plan-f056442e64a3) — the first build in 10
  ordered slices, each with its scope, what it needs first and its acceptance checks, in Linear
- [Platform design index](design/platform/README.md) — the design areas and their indexes
- [Skills](design/platform/skills.md) — skills in the definitions, vendoring and the lock, versions
  and reload, skill lists, the skill tools, the catalog, scripts and skills that nixie writes

### Core

- [Core design index](design/platform/core/README.md) — the core docs
- [The event log and records](design/platform/core/event-log.md) — what a record holds, append-only
  semantics, projections, the data behind the dashboard and the live view, export and retention
- [Tasks](design/platform/core/tasks.md) — tasks as state machines with leases and an inbox, waits,
  the conversation's task tools, task runs of a definition, workers in imps, and crash recovery
- [Model profiles](design/platform/core/models.md) — the profile, model roles and their defaults,
  and how nixie computes model cost

### Policy

- [Policy design index](design/platform/policy/README.md) — the 5 policy docs and the spike behind
  them
- [The policy decision point](design/platform/policy/decision-point.md) — the pipeline, effects, the
  always-ask set, destination limits and consent, taint in the first build, auto-mode and prompt
  causes
- [Rules](design/platform/policy/rules.md) — the rule format, evaluation order, rule identity, the
  snapshot hash, the widening check, proposed rules, mandates and the starter rule set
- [Rule conflicts and the rule export](design/platform/policy/rule-conflicts-and-export.md) — a
  runtime change against a repo change, and the one rolling pull request that exports runtime
  changes
- [Proposals and approvals](design/platform/policy/approvals.md) — the proposal and its action hash,
  risk classes, the approval record, one-tap "always allow" and the approval digest
- [Budgets, lifts and the spending stop](design/platform/policy/budgets.md) — budgets, lifting
  rules, model cost and the hard spending stop

### Memory

- [Memory writes](design/platform/memory/writes.md) — the client's proposal cards and notices
- [Memory in context](design/platform/memory/context.md) — past messages in retrieval, the recall
  tools, compaction summaries, and the SDK transcript as a cache
- [Moments](design/platform/memory/moments.md) — kept spans of the event log, their records and
  tools, links from memory items, reading back, and destroying a moment

### Channels

- [Channels design index](design/platform/channels/README.md) — the client, the channel adapter,
  approvals, the live view and the trigger source
- [The client](design/platform/channels/client.md) — the web client and the Expo app, the typed API,
  device sessions, paste spans and messages into a running task
- [The channel adapter](design/platform/channels/channel-adapter.md) — the interface, the identity
  record, and the Telegram notifier with its content-free notice
- [Approvals in the client](design/platform/channels/approvals.md) — cards, your choices with Defer,
  the server's check, and the approval digest
- [The dashboard and the live view](design/platform/channels/live-view.md) — the dashboard, a task
  as a conversation and stepping in
- [The trigger source](design/platform/channels/trigger-source.md) — schedules, polls, webhooks and
  streams

### Connectors

- [Connectors design index](design/platform/connectors/README.md) — the connector interface and
  Google, tools and the MCP endpoint, the external-server proxy, the coding adapter, the sandbox
  adapter, credentials and the definitions source

### Deployment

- [Deployment design index](design/platform/deployment/README.md) — the 4 deployment docs
- [Deployment](design/platform/deployment/deployment.md) — the first build, the host, the images,
  secrets, seeding the definitions, health, and Kubernetes
- [Backup and restore](design/platform/deployment/backup-and-restore.md) — the backup job, Restic
  snapshots, the key repo and forget, the offsite replica, and restoring on a new host
- [Release pipeline](design/platform/deployment/release-pipeline.md) — the worker, code and backup
  images, pinned binary updates, the rollback test, Renovate and attestation verification
- [Upgrades](design/platform/deployment/upgrades.md) — the pin and the bot, delivery to the host, a
  release on the host, migrations, and rollback

## Decisions

A choice gets a decision record only when it passes three tests: a capable newcomer would otherwise
undo it, undoing it is costly, and the option it rejected was real. A security boundary always
passes the first test. Each record states its decision as it stands, with its reasons and the
alternatives it rejected. Every other decision lives in the architecture doc or the design that
describes it. The numbers are stable IDs in the order the decisions were made, and a removed record
leaves its number unused.

### Core

The durable layer, the sandbox boundary, the database and compaction.

- [0001: The durable layer](decisions/0001-durable-layer.md) — nixie's own event log, with each long
  task as a state machine, instead of a durable execution engine
- [0003: Where the Agent SDK runs](decisions/0003-sdk-placement.md) — every model loop in an imp,
  with only nixie's tools, which run on the host
- [0011: The database](decisions/0011-sqlite-on-one-host.md) — one SQLite database on one host, and
  Postgres only for a second host
- [0018: Recurrence](decisions/0018-use-rrule-temporal-for-recurrence.md) — nixie expands schedules
  with `rrule-temporal` and maps local times onto the clock itself
- [0019: Possibly-sent actions](decisions/0019-never-retry-a-possibly-sent-action-blindly.md) — an
  action that may have reached its provider is never sent again without a key, a check or the user
- [0022: A busy task's fires](decisions/0022-a-busy-task-skips-a-fire.md) — a trigger that fires
  while the task is still busy is skipped, never queued
- [0024: Undoing a definition change](decisions/0024-only-the-user-undoes-a-definition-change.md) —
  only the user undoes one, and the agent has no tool for it
- [0015: Compaction](decisions/0015-own-compaction.md) — nixie's own compactor with the summary in
  the event log, and the SDK's auto-compaction off
- [0057: Every optional feature has a switch](decisions/0057-every-optional-feature-has-a-switch.md)
  — an optional feature is on only when its section is in the deployment config, and off it leaves
  no trace

### Policy

Approvals, the rule engine, untrusted content and the spending stop.

- [0002: Actions and approvals](decisions/0002-approvals.md) — an action that needs approval becomes
  a proposal that ends the turn, and you answer it only with a checked action in the client, never
  with a chat message or a spoken "yes"
- [0004: The rule engine](decisions/0004-rule-engine.md) — nixie's own rule format and evaluator, in
  place of Cedar or OPA
- [0005: The untrusted conversation](decisions/0005-untrusted-conversation.md) — the conversation is
  always untrusted and carries no taint flag, so the destination limits apply to every send
- [0012: The spending stop](decisions/0012-spending-stop.md) — a model gateway on the host counts
  model spend and refuses requests past the budget, in place of the SDK's cap inside the sandbox
- [0016: The definitions repo's widenings](decisions/0016-trust-the-definitions-repo.md) — a seed
  applies every widening from the repo at once, and only a widening that starts inside nixie asks

### Memory

Forgetting, and the memory writes that skip review.

- [0007: Forgetting](decisions/0007-crypto-shredding.md) — forgetting destroys the item's key, and
  stays pending until every backup drops it
- [0023: Topics](decisions/0023-a-topic-has-no-id.md) — a memory topic has no ID or hash, so a
  forget leaves nothing that leads to it
- [0025: Reading kept moments](decisions/0025-memory-read-gates-moment-read.md) — `memory: read`
  decides which task reads a kept moment, and the log grant plays no part
- [0008: Which memory writes skip review](decisions/0008-memory-write-review.md) — a write applies
  at once only when a quote you typed backs it and the token check and the checker pass, and every
  other write is a proposal

### Channels

The client and voice.

- [0006: The first channel](decisions/0006-own-client.md) — nixie's own client holds the
  conversation, approvals and voice, and chat apps carry content-free pushes
- [0014: What speaks a voice call](decisions/0014-voice-pipeline.md) — GPT-Live hears and speaks the
  call, and nixie's turn writes every answer

### Connectors

External MCP servers and connector authorization.

- [0009: External MCP servers](decisions/0009-mcp-proxy.md) — every MCP server outside nixie's code
  reaches the model only through nixie's proxy
- [0010: Connector authorization](decisions/0010-oauth-clients.md) — each deployment registers its
  own OAuth clients
- [0020: The tool route](decisions/0020-the-tool-route-is-a-channel-per-sandbox.md) — a sandbox
  reaches the tools over a channel bound to it, never a network route
- [0021: The fetch sandbox](decisions/0021-a-fresh-sandbox-per-fetch.md) — each web fetch runs in a
  sandbox of its own

### Deployment

Backups.

- [0013: Offsite backups and replication](decisions/0013-host-encrypted-backups.md) — backups leave
  the host only as ciphertext encrypted on the host, and a backup job of its own holds the only
  backup credential
- [0017: Publish numbers](decisions/0017-publish-numbers-are-snapshot-tags.md) — the backup job
  counts publishes in the repositories' snapshot tags, never in nixie's database

## Archive

The phase 1 brainstorm and the phase 2 research are archived at the
[`research-archive`](https://github.com/zgeoff/nixie/tree/research-archive/docs) tag. The decisions
supersede them, and links that cite them as evidence point at that tag.

A spike is deleted once its finding sits in the architecture doc that owns it. The deleted spikes
are archived at commit
[`e232631`](https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc/docs/design/platform/spikes),
and links that cite them as evidence point at that commit.

## Spikes

The [spikes index](../research/README.md) lists every spike: a throwaway experiment that answers one
research question, runnable, with its output and what it left untested.
