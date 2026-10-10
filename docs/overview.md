# nixie overview

nixie is a self-hosted personal assistant platform. Its owner holds full control of its behaviour
and can see how every part of it works. Hosted assistants apply rules the owner cannot see or
override, and keep memory the owner cannot inspect; nixie exists to remove both limits.

nixie works in the background and reaches out first: a morning report, a reminder, a status update
when work is ready, and tasks it does on the owner's behalf. Conversation runs both ways at any
time, in text or by voice. The owner works through one conversation, and nixie handles the work
behind it like a chief of staff: it does not need managing, and it shows everything when asked.

This page states the current design in brief. Each point links the decision that settled it, and
[open items](./design/open-items.md) lists what is still open. [Principles](./principles.md) and
[scope](./scope.md) set what binds the design.

## Tiers

| Tier          | Holds                                                   | Lives in                                         |
| ------------- | ------------------------------------------------------- | ------------------------------------------------ |
| System        | Platform code, defaults and docs                        | The public `nixie` repo                          |
| Definitions   | One owner's persona, jobs and policy seed               | A private repo, or another definitions source    |
| Deployment    | The image version, infrastructure, secrets and backups  | Wherever the owner deploys nixie                 |
| Personal data | Memory, conversations, the event log and connector data | Hosts the owner controls, with encrypted backups |

The public repo ships no persona and no policy that encodes one owner: every behaviour is data that
the owner's definitions supply.

## Jobs

An owner defines their own jobs, and nixie ships none. nixie must be able to run these kinds of job:

| Kind                                         | Example                                                              | Risk   |
| -------------------------------------------- | -------------------------------------------------------------------- | ------ |
| Scheduled briefing                           | A morning report                                                     | Low    |
| Reminder and follow-up                       | "Call back about the booking at 3 pm"                                | Low    |
| Background work, reported when ready         | "The research you asked for is done"                                 | Low    |
| Upkeep of an owner's service                 | Inbox triage, calendar, task list, file cleanup                      | Medium |
| Acting in the outside world                  | A purchase, a phone call, an SMS                                     | High   |
| Capture and recall                           | Save a link now, find it by meaning later                            | Low    |
| Research and making things                   | A reading detour, a short write-up, an image                         | Low    |
| Work on private data, on a model run locally | Summarise medical or financial records                               | Medium |
| Steering other agents                        | Start coding agent sessions, write their briefs, check their results | Medium |

Conversation is not a kind of job. Every job runs through it.

## Core

nixie keeps its own event log, and each long task is an explicit state machine over it, instead of
running inside a durable execution engine ([0001](./decisions/0001-durable-layer.md)). The log lives
in one SQLite database, and nixie is a modular monolith of workspace packages
([0025](./decisions/0025-database-and-topology.md)).

The model runs one turn at a time through the Agent SDK, and nixie owns the loop around it. Anything
that runs a model loop over untrusted content runs in an imp, and nixie's tools stay on the host.
Each worker gets its own imp with the whole worker inside it, the conversation lives in a long-lived
imp that stays awake, and sessions on the built-in coding adapter run inside an imp
([0003](./decisions/0003-sdk-placement.md),
[0026](./decisions/0026-where-workers-and-the-conversation-run.md)).

The owner talks to the main thread. The main thread routes work to tasks, which are durable side
threads with their own context and tools, and tasks start workers, each a disposable unit of work
behind one tool call. The main thread names where it sent each message and works from a live task
board. A live view of the whole system reads the same data, so the owner can inspect any task and
step in ([0018](./decisions/0018-main-thread-and-tasks.md)).

An outside action with side effects runs on a durable queue with an explicit outcome. An outside
action whose outcome is unknown after a crash is retried only with an idempotency key or after a
check that it did not happen, and otherwise goes to the owner
([0021](./decisions/0021-outside-action-outcomes.md)).

The conversation is itself a task, which never closes. The owner can pause a task in place, stop its
run and restart it later, or close it for good, and every run knows when it was meant to start and
whether it is a catch-up. Task state lives in tables beside the log, checked against it by a rebuild
([0027](./decisions/0027-tasks-and-outside-actions.md)).

## Policy

Every outside action runs through one of nixie's tools. An action that needs approval becomes a
proposal and ends the turn, and an approval is a checked action in the client, never a chat message
([0002](./decisions/0002-approvals.md)). Proposals never block the conversation.

Rules in nixie's own format allow, ask or deny each tool call, and no matching rule means ask
([0004](./decisions/0004-rule-engine.md)). Every tool declares its effects. 3 effects always ask:
spending money, widening rules or approvals, and raising a budget. A bounded rule can lift them,
creating one always asks, and such approvals look distinct in the client
([0023](./decisions/0023-lifting-always-ask.md)). A change that only narrows applies at once with a
record and undo ([0005](./decisions/0005-effects-and-taint.md)). The target is 0 prompts, and every
prompt records its cause. A prompt because no rule matched counts as a gap in the rules, and nixie
proposes the rule that would close it.

The conversation is always treated as untrusted, because it reads outside content within minutes. A
send to a destination that neither the owner nor a rule named asks first. Taint tracking applies to
jobs and workers in stages, starting with every job run treated as untrusted
([0015](./decisions/0015-taint-scope.md)).

An approval binds to one exact action and is used once. "Always allow" becomes a rule, and consent
can come from the owner's own message ([0006](./decisions/0006-approval-record.md)). auto-mode, a
separate classifier, decides what the deterministic layers leave open, never overrides them, and
fails closed; nixie runs fully without it ([0008](./decisions/0008-auto-mode.md)). Approvals for the
always-ask set gain a passkey check after the first build
([0012](./decisions/0012-high-risk-approvals.md)).

A consent checker that nixie builds confirms that the owner's own message asked for an action, so a
direct request that no rule covers runs without a prompt. A prompt from a rule the owner wrote is
counted apart from the 0-prompt target. A counting proxy on the host enforces a hard spending stop.
Rules are YAML in the definitions repo, and the starter set is permissive, with a notice and undo
for every job created or changed ([0028](./decisions/0028-policy-design.md)).

## Memory

Memory is rows in nixie's database, with provenance the model cannot write and a history table. The
owner manages it in the client, and a raw recall tool returns stored items, not paraphrase. The
owner can export all of it to a plain format. Forgetting is crypto-shredding, with a key per item
([0010](./decisions/0010-memory-store.md)).

A memory applies at once, with notice and undo, only when an exact quote from the owner's message
backs it, the quote is text the owner typed rather than pasted, its destination-like tokens appear
in that quote, and a checker model that sees the owner's whole message confirms the owner asserted
it. Every other write is a proposal ([0011](./decisions/0011-memory-writes.md)).

Every record carries a hash of the definitions in force. Rule and policy changes reach running tasks
at once, and persona and job definitions stay fixed for a task's life
([0013](./decisions/0013-definition-versioning.md)).

The conversation runs on the Agent SDK's session and compaction, and a compaction summary never
becomes memory ([0024](./decisions/0024-memory-in-context.md)). nixie retrieves from memory and past
messages with local embeddings and keyword search. The conversation writes memory during chat, and a
background writer captures passing facts in batches. The SDK transcript is a cache that nixie
rebuilds from the event log. "Forget that" in chat retires an item with undo, and only a checked
action in the client destroys one ([0031](./decisions/0031-memory-capture-context-and-removal.md)).

## Channels

nixie's own client holds the conversation, approvals and voice: a web client for desktop browsers
and a React Native app built with Expo, Android first. Chat apps such as Telegram carry only a push
notice with no content and a link to the client ([0009](./decisions/0009-first-channel.md)). Voice
is essential but not in the first build, and its stack is deferred.

Both clients share one oRPC contract served through Elysia, with a live stream over server-sent
events. The web client runs on TanStack Start inside nixie's own process. A device signs in with an
enrolment code, and later a passkey. A proposal shows as a card in its thread and on the digest
sheet, with Approve, Always allow, Defer and Decline. A push buzzes only for items that need the
owner's judgement ([0029](./decisions/0029-channels-and-clients.md)).

## Connectors

nixie takes tools from MCP and defines 4 interfaces of its own: a channel adapter, a trigger source,
a connector and a credential store, which can use several backends, imp's broker among them
([0016](./decisions/0016-own-interfaces.md)). Sandboxed work runs through a sixth interface, the
sandbox adapter, with imp as its reference. An imp that reads untrusted content gets no credential
grant beyond the model API's own, which the broker injects so the guest sees only a placeholder
([0007](./decisions/0007-grants-and-taint.md),
[0026](./decisions/0026-where-workers-and-the-conversation-run.md)).

nixie runs code for general work in a disposable imp with no credential grants. It is not a coding
agent; it steers coding agents through a coding agent adapter, with atc first and a built-in
single-session adapter later ([0022](./decisions/0022-coding-and-code-execution.md)).

Every MCP server outside nixie's code, the owner's own included, reaches the model only through a
proxy that pins each tool by hash and requires declared effects. The proxy arrives with the first
outside server ([0017](./decisions/0017-mcp-proxy.md)).

Each owner registers their own OAuth clients, and nixie ships no central app
([0019](./decisions/0019-connector-authorization.md)). Search is one of nixie's tools, on Kagi
first, returning full results to the conversation ([0014](./decisions/0014-search.md)).

A model in an imp reaches nixie's tools through a reverse forward, with no network egress. Google is
the first connector. nixie's tools and its proxy use the v2 MCP packages, and the first build
implements the imp sandbox only. The code environment offers Node.js, Python and common Linux tools.
Disconnect stops nixie's use of a credential it cannot delete at its source
([0030](./decisions/0030-connectors-and-sandbox-environments.md)).

The [MCP proxy design](./design/connectors/mcp-proxy.md) connects an outside server whose backend
lives outside the sandbox, such as atc, over HTTP with a scoped OAuth grant that the deployment
configures.

## Deployment

An owner's definitions live apart from the deployment and reach nixie through a definitions source:
a git repo, a local path or bucket storage. The definitions seed the database, which is the one
place the owner looks, and a seed that widens a rule waits for the owner's confirmation. Docker
Compose on one host is the recommended deployment, and Kubernetes managed with Pulumi is also viable
([0020](./decisions/0020-deployment.md)).

Restic takes encrypted snapshots of the data and key stores. Litestream replicates the database to
S3-compatible storage through an rclone crypt gateway on the host, so the provider holds only
ciphertext. The deployment chooses the backend. The first build runs Restic snapshots on one host,
and the replica follows ([0032](./decisions/0032-offsite-backups-and-replication.md)).
