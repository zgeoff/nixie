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

| Tier          | Holds                                                   | Lives in                                      |
| ------------- | ------------------------------------------------------- | --------------------------------------------- |
| System        | Platform code, defaults and docs                        | The public `nixie` repo                       |
| Definitions   | One owner's persona, jobs and policy seed               | A private repo, or another definitions source |
| Deployment    | The image version, infrastructure, secrets and backups  | Wherever the owner deploys nixie              |
| Personal data | Memory, conversations, the event log and connector data | Hosts the owner controls, with backups        |

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
running inside a durable execution engine ([0001](./decisions/0001-durable-layer.md)). The database
behind the log, and how the system splits into modules, are deferred to Phase 3.

The model runs one turn at a time through the Agent SDK, and nixie owns the loop around it.
Assistant work runs on the host with only nixie's tools; sessions on the built-in coding adapter run
inside an imp and reach nixie's tools over MCP ([0003](./decisions/0003-sdk-placement.md)).

The owner talks to the main thread. The main thread routes work to tasks, which are durable side
threads with their own context and tools, and tasks start workers, which are disposable jobs behind
a tool call. The main thread names where it sent each message and works from a live task board. A
live view of the whole system reads the same data, so the owner can inspect any task and step in
([0018](./decisions/0018-main-thread-and-tasks.md)).

An outside action with side effects runs as a job on a durable queue with an explicit outcome. A job
whose outcome is unknown after a crash is retried only with an idempotency key or after a check that
it did not happen, and otherwise goes to the owner
([0021](./decisions/0021-outside-action-outcomes.md)).

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
prompt records its cause.

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

## Memory

Memory is rows in nixie's database, with provenance the model cannot write and a history table. The
owner manages it in the client, and a raw recall tool returns stored items, not paraphrase.
Forgetting is crypto-shredding, with a key per item ([0010](./decisions/0010-memory-store.md)).

A memory applies at once, with notice and undo, only when an exact quote from the owner's message
backs it, the quote is text the owner typed rather than pasted, its destination-like tokens appear
in that quote, and a checker model that sees the owner's whole message confirms the owner asserted
it. Every other write is a proposal ([0011](./decisions/0011-memory-writes.md)).

Every record carries a hash of the definitions in force. Rule and policy changes reach running tasks
at once, and persona and job definitions stay fixed for a task's life
([0013](./decisions/0013-definition-versioning.md)).

The conversation runs on the Agent SDK's session and compaction. nixie adds retrieval over memory
and over the event log, starting with keyword search, and a compaction summary never becomes memory.

## Channels

nixie's own client holds the conversation, approvals and voice: a web client for desktop browsers
and a React Native app built with Expo, Android first. Chat apps such as Telegram carry only a push
notice with no content and a link to the client ([0009](./decisions/0009-first-channel.md)). Voice
is essential but not in the first build, and its stack is deferred.

## Connectors

nixie takes tools from MCP and defines 4 interfaces of its own: a channel adapter, a trigger source,
a connector and a credential store, which can use several backends, imp's broker among them
([0016](./decisions/0016-own-interfaces.md)). An imp that reads untrusted content gets no credential
grant ([0007](./decisions/0007-grants-and-taint.md)).

nixie runs code for general work in a disposable imp with no credential grants. It is not a coding
agent; it steers coding agents through a coding agent adapter, with atc first and a built-in
single-session adapter later ([0022](./decisions/0022-coding-and-code-execution.md)).

Every MCP server outside nixie's code, the owner's own included, reaches the model only through a
proxy that pins each tool by hash and requires declared effects. The proxy arrives with the first
outside server ([0017](./decisions/0017-mcp-proxy.md)).

Each owner registers their own OAuth clients, and nixie ships no central app
([0019](./decisions/0019-connector-authorization.md)). Search is one of nixie's tools, on Kagi
first, returning full results to the conversation ([0014](./decisions/0014-search.md)).

## Deployment

An owner's definitions live apart from the deployment and reach nixie through a definitions source:
a git repo, a local path or bucket storage. The definitions seed the database, which is the one
place the owner looks, and a seed that widens a rule waits for the owner's confirmation. Docker
Compose on one host is the recommended deployment, and Kubernetes managed with Pulumi is also viable
([0020](./decisions/0020-deployment.md)).
