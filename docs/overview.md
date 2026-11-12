# nixie overview

nixie is a self-hosted personal assistant platform that you control completely and can see into at
every level. Hosted assistants apply rules you cannot see or override, and keep memory you cannot
inspect; nixie removes both limits.

nixie works in the background and reaches out first: a morning report, a reminder, a status update
when work is ready, and tasks it does for you. You work through one conversation, in text and later
by voice, and nixie handles the work behind it like a chief of staff. It needs no managing, and it
shows everything when you ask. You never need to open a task to get work done.

Each point below links the decision record or doc that settles it. [Principles](principles.md) and
[scope](scope.md) bind the design, and the
[Linear project](https://linear.app/zgeoff/project/nixie-caa59289fb88) lists what is open.

## Tiers

| Tier          | Holds                                                   | Lives in                                      |
| ------------- | ------------------------------------------------------- | --------------------------------------------- |
| System        | Platform code, defaults and docs                        | The public `nixie` repo                       |
| Definitions   | Your persona, jobs and policy seed                      | A private repo, or another definitions source |
| Deployment    | The image version, infrastructure, secrets and backups  | Wherever you deploy nixie                     |
| Personal data | Memory, conversations, the event log and connector data | Hosts you control, with encrypted backups     |

The public repo ships no persona, no jobs and no policy for any one person. Every behaviour is data
your definitions supply.

## Jobs

nixie ships no jobs. It runs these kinds of job, each one defined in your definitions:

| Kind                                   | Example                                                  | Risk   |
| -------------------------------------- | -------------------------------------------------------- | ------ |
| Scheduled briefing                     | A morning report                                         | Low    |
| Reminder and follow-up                 | "Call back about the booking at 3 pm"                    | Low    |
| Background work, reported when ready   | "The research you asked for is done"                     | Low    |
| Upkeep of a service you use            | Inbox triage, calendar, task list, file cleanup          | Medium |
| Acting in the outside world            | A purchase, a phone call, an SMS                         | High   |
| Capture and recall                     | Save a link now, find it by meaning later                | Low    |
| Research and making things             | A reading detour, a short write-up, an image             | Low    |
| Work on private data, on a local model | Summarise medical or financial records                   | Medium |
| Steering other agents                  | Start coding sessions, write their briefs, check results | Medium |

## Core

nixie keeps its own event log in one SQLite database, and each long task is a state machine over it
([0001](decisions/0001-durable-layer.md), [0011](decisions/0011-sqlite-on-one-host.md)). nixie is a
modular monolith of workspace packages.

The model runs one turn at a time through the Agent SDK, and nixie owns the loop around it. Every
model loop runs in an imp: each worker in its own imp, and the conversation in a long-lived imp that
stays awake. nixie's tools stay on the host ([0003](decisions/0003-sdk-placement.md),
[sandboxes](architecture/connectors/sandboxes.md),
[conversation turns](architecture/core/conversation-turns.md)).

You talk to the conversation, which routes work to tasks. A task is a durable side thread with its
own context and tools, and it starts workers, each a disposable unit of work behind one tool call.
The conversation says where it sent each message. The dashboard and the live view read the same
data, so you can open any task and step in ([tasks](architecture/core/tasks.md),
[the live view](design/platform/channels/live-view.md)).

An action runs on the durable action queue with an explicit outcome. An action whose outcome is
unknown after a crash is retried only with an idempotency key or after a check that it did not
happen, and otherwise comes to you ([actions](architecture/core/actions.md)). You can pause a task,
stop a task run and restart it, or close the task for good, and every task run knows whether it is a
catch-up ([tasks](architecture/core/tasks.md),
[the trigger source](design/platform/channels/trigger-source.md)).

## Policy

Every action runs through one of nixie's tools. An action that needs your approval becomes a
proposal and ends the turn, and an approval is a checked action in the client, never a chat message
([0002](decisions/0002-approvals.md)). Proposals never block the conversation.

Rules in nixie's own format allow, ask or deny each tool call, in a fixed pipeline where no matching
rule means ask ([0004](decisions/0004-rule-engine.md),
[the policy decision point](design/platform/policy/decision-point.md)). Every tool declares its
effects, and 3 effects always ask: spending money, widening rules or approvals, and raising a
budget. A bounded rule can lift them, and creating one always asks
([the policy decision point](design/platform/policy/decision-point.md)). The target is 0 prompts,
and every prompt records its cause.

The conversation counts as untrusted, because it reads outside content within minutes. A send to a
destination that neither you nor a rule named asks first. Taint applies to jobs and workers in
stages ([0005](decisions/0005-untrusted-conversation.md)).

An approval binds to one exact action and is used once. "Always allow" is one tap that also creates
the rule shown on the card ([proposals and approvals](design/platform/policy/approvals.md)). A
consent checker confirms that your own message asked for an action, so a direct request that no rule
covers runs without a prompt. Consent never overrides a deny rule, an ask rule or the always-ask
set. A counting proxy on the host enforces a hard spending stop
([0012](decisions/0012-spending-stop.md)), and rules are YAML in your definitions
([rules](architecture/policy/rules.md)). auto-mode decides only what the deterministic layers leave
open, and nixie runs fully without it
([the policy decision point](design/platform/policy/decision-point.md)). Approvals for the
always-ask set gain a passkey check after the first build
([approvals in the client](design/platform/channels/approvals.md)).

## Memory

Memory is rows in nixie's database, each item with its own key, a history and provenance the model
cannot write. You manage it in the client and export it whole, and forgetting destroys the item's
key ([the memory store](architecture/memory/store.md),
[memory export](architecture/memory/export.md), [0007](decisions/0007-crypto-shredding.md)).

A memory applies at once, with a notice and undo, only when a quote you typed backs it and a checker
confirms you asserted it. Every other write is a proposal
([0008](decisions/0008-memory-write-review.md)). The conversation writes memory during chat, and a
background writer captures passing facts in batches. "Forget that" in chat retires an item with
undo, and only a checked action in the client destroys one
([the memory store](architecture/memory/store.md)).

The conversation runs on the SDK's session, and nixie compacts it itself
([0015](decisions/0015-own-compaction.md)). Retrieval uses local embeddings and keyword search over
memory and past messages, and a compaction summary never becomes memory
([the memory store](architecture/memory/store.md), [compaction](architecture/core/compaction.md)).
Every record carries a hash of the definitions in force
([the definitions](architecture/core/definitions.md)).

## Channels

nixie's own client holds the conversation and the approvals: a web client on TanStack Start, which
runs as its own server and forwards your device session to nixie's API, and an Android app built
with Expo. The web client and the API share one host name, and a reverse proxy splits them by path.
Both share one oRPC contract served through Elysia, with a live stream over server-sent events. Chat
apps such as Telegram carry only a content-free push ([0006](decisions/0006-own-client.md),
[the client](architecture/channels/client.md), [the API](architecture/channels/api.md)).

A proposal shows as a card in its thread and in the approval digest, with Approve, Always allow,
Defer and Decline. A push buzzes only for items that need your judgement. Voice is essential but not
in the first build.

## Connectors

nixie takes tools from MCP and defines its own interfaces: the channel adapter, trigger source,
connector, credential store, definitions source and sandbox adapter
([the platform design index](design/platform/README.md)). An imp that reads untrusted content gets
no credential grant beyond the model API's own ([sandboxes](architecture/connectors/sandboxes.md)).

A model in an imp reaches nixie's tools through a reverse forward, with no network egress. Google is
the first connector, the first build implements the imp sandbox only, and the code environment
offers Node.js, Python and the common Linux tools
([sandboxes](architecture/connectors/sandboxes.md),
[the connector design](design/platform/connectors/connector.md)). You register your own OAuth
clients ([0010](decisions/0010-oauth-clients.md)), and search runs on Kagi
([search](architecture/connectors/search.md)).

nixie is not a coding agent. It runs code for general work in a disposable imp with no grants, and
it steers coding agents through a coding adapter, atc first
([the coding adapter design](design/platform/connectors/coding.md)). Every external MCP server
reaches the model only through a proxy that pins each tool by hash
([0009](decisions/0009-mcp-proxy.md), [MCP proxy](design/platform/connectors/mcp-proxy.md)). atc
connects as an external server over HTTP, configured by the deployment
([MCP proxy](design/platform/connectors/mcp-proxy.md)).

## Deployment

Your definitions seed the database from a definitions source, and a seed that widens a rule waits
for your confirmation. Kubernetes and Docker Compose are both supported from the first build, with
Compose as the recipe for local use and any single host
([the definitions](architecture/core/definitions.md),
[the deployment design](design/platform/deployment/deployment.md)).

Restic snapshots the data and key stores. Litestream replicates the database to S3-compatible
storage through an rclone crypt gateway on the host, so the provider holds only ciphertext, and the
deployment chooses the backend. The first build runs Restic snapshots on one host, and the replica
follows ([backup and restore](design/platform/deployment/backup-and-restore.md)).
