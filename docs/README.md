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
- [Principles](principles.md) — the rules every job and deployment holds to
- [Scope](scope.md) — requirements in tiers, and non-goals
- [Glossary](glossary.md) — the terms the docs and the code use, one meaning each
- [Planned work](https://linear.app/zgeoff/project/nixie-caa59289fb88) — the nixie project in
  Linear: the slice plan, choices that need you, spikes, design tasks and later stages

`architecture/` holds what is built, with the rules and contracts each part keeps. `design/<work>/`
holds the design for a piece of work that is not built yet, with its spikes in
`design/<work>/spikes/`: `design/platform/` is the first. `decisions/` holds the few
[decision records](#decisions). Planned work lives in Linear.

## Architecture

- [Architecture overview](architecture/overview.md) — the path of a tool call, the client path, the
  topology, the data and the cross-cutting rules, on one page
- [Code layout](architecture/code-layout.md) — the workspace folders, the packages, the boundary
  tags and import zones, the module packages, and the tests, test builds and checks

### Core

- [The database and the single writer](architecture/core/database.md) — one SQLite file in a worker
  thread, the writer lock and epoch, migrations and the oldest reader
- [The event log](architecture/core/event-log.md) — records, appending, projections and their
  rebuild, and reading by sequence
- [Erasable fields](architecture/core/erasable-fields.md) — a key per record, the key store beside
  the database, and forgetting by destroying a key
- [Tasks](architecture/core/tasks.md) — task states, the inbox and its read cursor, steps and their
  commit, and durable timers
- [Started tasks](architecture/core/started-tasks.md) — the start and its options, the nixie runner,
  limits and their raise
- [Task messages](architecture/core/task-messages.md) — messages between tasks, the hop limit and
  message waits
- [Leases and recovery](architecture/core/leases-and-recovery.md) — the one claim path, lease
  generations, runner pools, crash recovery and fault points
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
- [The model gateway](architecture/policy/model-gateway.md) — routes, the count and its store, the
  spending limit and the refusals

### Connectors

- [Tool calls](architecture/connectors/tool-calls.md) — one endpoint per run, tool definitions, the
  call steps, and the records of each call
- [Sandboxes](architecture/connectors/sandboxes.md) — kinds of work, records and recovery, the tool
  route, the imp adapter and the test sandbox
- [Web fetch](architecture/connectors/web-fetch.md) — the fetch sandbox, the fetcher's address
  checks, the limits and the result
- [Web fetch images](architecture/connectors/web-fetch-images.md) — a fetched image as image
  content, its limits, and how the host downscales it
- [Time](architecture/connectors/time.md) — the time zone on each message, and the time tool that
  answers in the user's newest zone
- [Search](architecture/connectors/search.md) — the search tool on the host, its daily call cap, the
  Kagi provider and its key

### Channels

- [The client](architecture/channels/client.md) — the oRPC contract, session forwarding, the
  conversation view, the outbox and paste spans
- [The API](architecture/channels/api.md) — device sessions and the identity record, checked
  actions, refusals, message sends and the live stream

### Memory

- [The memory store](architecture/memory/store.md) — items and versions, the 4 states, changes bound
  to a version, a key per item, recall with its index and delivery lock, forgetting, and the model's
  tools
- [The memory writer](architecture/memory/writer.md) — batches of conversation turns, the catch-up,
  a fresh session per batch, publishing in one transaction, backoff, and the memory changes the
  conversation hears of
- [Memory writes](architecture/memory/writes.md) — the content gate and its quote, token and checker
  checks, retirement intent, provenance, memory proposals and notices
- [Memory consolidation](architecture/memory/consolidation.md) — the weekly diff of merges, rewrites
  and retirements, each change bound to the versions it read, and answers whole or per change
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
- [The memory writer eval](architecture/memory/writer-eval.md) — the cases, the rule each run must
  meet, and the results per prompt

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

## Guides

- [Vendoring a skill](guides/vendoring-a-skill.md) — copy a published skill into your definitions at
  a pinned commit, compute its content hash and add its lock entry
- [Overriding a prompt](guides/overriding-a-prompt.md) — replace a part or the template of a
  built-in prompt from your definitions, and the parts and paths each prompt has
- [Run nixie with Docker Compose](guides/compose.md) — the reference recipe, its placeholders and
  secrets, signing in, and how CI checks it
- [Run nixie on Kubernetes](guides/kubernetes.md) — the reference manifests, their placeholders and
  secrets, and validating them

## Runbooks

- [Releasing](runbooks/releasing.md) — the release App, cutting a release, making a sandbox image
  public, checking an attestation and repairing a failed release
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

- [Core design index](design/platform/core/README.md) — the 6 core docs
- [The event log and records](design/platform/core/event-log.md) — what a record holds, append-only
  semantics, projections, the data behind the dashboard and the live view, export and retention
- [Tasks](design/platform/core/tasks.md) — tasks as state machines with leases and an inbox, waits,
  the conversation's task tools, job runs, workers in imps, and crash recovery
- [Actions](design/platform/core/actions.md) — the action queue, its outcomes, approval consumption,
  reconciliation per connector, and unknown outcomes
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

- [The memory store](design/platform/memory/store.md) — the first build, bulk deletion of retired
  memories, forget completion with key backups, the memory view and export
- [Memory writes](design/platform/memory/writes.md) — the memory writer, batched capture, and the
  client's proposal cards and notices
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
- [0015: Compaction](decisions/0015-own-compaction.md) — nixie's own compactor with the summary in
  the event log, and the SDK's auto-compaction off

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

### Memory

Forgetting, and the memory writes that skip review.

- [0007: Forgetting](decisions/0007-crypto-shredding.md) — forgetting destroys the item's key, and
  stays pending until every backup drops it
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

### Deployment

Backups.

- [0013: Offsite backups and replication](decisions/0013-host-encrypted-backups.md) — backups leave
  the host only as ciphertext encrypted on the host, and a backup job of its own holds the only
  backup credential

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
