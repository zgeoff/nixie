# Durable execution engines and the Claude Agent SDK

Report: 2.2

The Claude Agent SDK keeps the state inside a turn durable on its own, so a durable execution engine
for nixie handles only the outer loop: timers, waits for an outside signal, steps that run at least
once, and deploys while tasks are parked for days. The test that separates the engines is whether an
engine parks a task on an approval for days without holding a process. The comparison covers
Temporal, Restate, DBOS, Inngest, Trigger.dev, Hatchet, and the newer contenders from 2025–2026, and
no engine has a Claude Agent SDK integration. The research recommends building the durable layer on
nixie's own event log with Kysely and Postgres, as explicit state machines, borrowing the semantics
of Absurd, OpenWorkflow, and DBOS. It ranks Restate and DBOS as fallbacks if the hand-rolled layer
costs too much.

All versions and dates were checked on 2026-10-07, against the cited page or the GitHub API.
"Unverified" marks a claim from general knowledge, and "inferred" marks a conclusion that no source
states.

## What the SDK keeps durable

The Claude Agent SDK keeps the state inside a turn durable through session transcripts, deferred
tool calls, and streaming input.

Session transcripts survive the process. The SDK writes each session to JSONL on local disk. A
`SessionStore` adapter copies each batch of entries to your own backend. `resume: sessionId`
restores the session, on another host if needed. The SDK repo ships a Postgres example adapter
([session storage docs](https://code.claude.com/docs/en/agent-sdk/session-storage)).

Deferred tool calls wait outside the process. A `PreToolUse` hook can return
`permissionDecision: "defer"`. The process then exits with `stop_reason: "tool_deferred"`, and the
result holds `deferred_tool_use` with its `id`, `name`, and `input`. A later `resume` fires the same
call's `PreToolUse` hook again, and the hook then returns `allow` or `deny`. The
[hooks docs](https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later) state: "There is no
timeout or retry limit." The
[TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript) documents the same
flow.

Streaming input adds messages to a live query through `streamInput()`. `interrupt()` returns a
receipt that lists the messages still queued, from Claude Code v2.1.205 onward
([streaming input docs](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)).

The [hosting docs](https://code.claude.com/docs/en/agent-sdk/hosting) describe nixie's shape as the
"hybrid sessions" pattern: containers that "hydrate from a `SessionStore` on startup". Their example
is "a personal project manager with intermittent check-ins".

## What the engine handles

The engine therefore does not have to make a turn durable. It handles only the outer loop:

- durable timers and schedules
- durable waits for an outside signal, with a stable handle that the approval UI resolves
- steps that run at least once, each with a stable ID that serves as the idempotency key
- safe deploys while tasks are parked for days

The test that separates the engines is whether an engine models this flow without one step that
stays open for days:

1. A step runs the turn.
2. The turn ends with `tool_deferred`.
3. A durable wait holds until the approval arrives.
4. A new step resumes the session with the answer.

An engine that pushes you to keep `canUseTool` pending inside one long activity fails this test.
That callback "can stay pending indefinitely", but only while the process stays alive
([user input docs](https://code.claude.com/docs/en/agent-sdk/user-input)).

Token streaming does not involve the engine. Tokens go from the live `query()` to the UI over
nixie's own channel, and the engine sees only the checkpoints. Engine streaming features, such as
Vercel Workflow `getWritable`, do not count in this comparison.

## Comparison

The engine sections hold the sources for each cell.

| Engine            | Version                        | Footprint                       | Bun                   | Days-long wait without a process      | Versioning                     | Licence                     |
| ----------------- | ------------------------------ | ------------------------------- | --------------------- | ------------------------------------- | ------------------------------ | --------------------------- |
| Temporal          | server v1.32.0, TS SDK v1.24.0 | Server, UI, and a database      | Experimental          | Signal and `condition()` (unverified) | `patched()`, Worker Versioning | MIT                         |
| Restate           | server v1.7.13, TS SDK v1.17.2 | 1 binary, no outside database   | Tested in CI          | Yes                                   | Old deployment kept            | Server BSL 1.1, SDK MIT     |
| DBOS TS           | v5.2                           | Library and Postgres            | Not official          | Partly                                | Same-version recovery          | MIT                         |
| Inngest           | server v1.46.0, SDK 4.22.0     | 1 binary                        | Documented            | Yes                                   | None                           | Server SSPL, SDK Apache-2.0 |
| Trigger.dev       | v4.7.3                         | 8+ services                     | Experimental          | Probably not (inferred)               | Locked to the deployed version | Apache-2.0                  |
| Hatchet           | v0.110.5                       | Go engine and Postgres          | Workers not supported | Yes                                   | New task per change            | MIT                         |
| Vercel Workflow   | 5.1.0                          | App and `world-postgres`        | Worked example only   | Hooks and webhooks                    | Not pinned when self-hosted    | Apache-2.0                  |
| Absurd            | 0.5.0                          | 1 SQL file in Postgres          | Not stated            | Yes                                   | None                           | Apache-2.0                  |
| TanStack Workflow | 0.0.4                          | Library and a store             | Not stated            | `waitForEvent`, `approve`             | `previousVersions`             | MIT                         |
| Resonate          | server v0.9.8, TS SDK 0.11.5   | Rust server                     | SDK needs Node 22+    | Unverified                            | `register(fn, name, version)`  | Apache-2.0                  |
| OpenWorkflow      | 0.10.1                         | Workers poll SQLite or Postgres | Tested in CI          | Signals                               | `version` argument in code     | Apache-2.0                  |
| Hand-rolled       | none                           | nixie's process and database    | Kysely runs on Bun    | Task row in a `waiting` state         | Explicit state machine         | nixie's own                 |

## Temporal

Temporal fits the model: one activity per turn, a signal for the approval, then a new activity to
resume. The costs are a separate server plus a database, experimental Bun support, and a patch on
every deploy that touches workflow code. Server v1.32.0 shipped on 2026-09-11, and TS SDK v1.24.0 on
2026-09-15.

A self-hosted Temporal Service is "two Go binaries -- the core Temporal Server, and the Temporal UI
Server", plus a database
([deployment guide](https://docs.temporal.io/self-hosted-guide/deployment)).
`temporal server start-dev --db-filename` keeps state in SQLite, but "The development server is not
intended for production use" ([CLI reference](https://docs.temporal.io/cli/server)).

Bun support is experimental since SDK
[v1.15.0](https://github.com/temporalio/sdk-typescript/releases/tag/v1.15.0), released 2026-02-18.
[PR #1906](https://github.com/temporalio/sdk-typescript/pull/1906) lists these limits:

- Stack traces have no source maps.
- Stack trace queries return empty results.
- "No guarantee workflows between Node and Bun are valid".

[v1.23.0](https://github.com/temporalio/sdk-typescript/releases/tag/v1.23.0), released 2026-08-26,
"Fixed compatibility with Bun 1.4" and pinned CI to Bun 1.3.14. The
[install page](https://docs.temporal.io/develop/typescript/install-typescript-sdk) lists only one
requirement: "This project requires Node.js 18 or later".

Workflow code replays from event history and must be deterministic. Adding, removing, or reordering
a command-producing `await` breaks replay. The fixes are `patched()` with `deprecatePatch()`, or
Worker Versioning. The [versioning docs](https://docs.temporal.io/develop/typescript/versioning)
state: "Support for the experimental Worker Versioning method before 2025 will be removed from
Temporal Server in March 2026."

A workflow waits for an approval with a signal and `condition()` (unverified). A message reaches a
running workflow as a signal or an update (unverified). The workflow ID is the idempotency key for a
workflow, and you supply the activity keys yourself (unverified).

`@temporalio/ai-sdk` targets Vercel AI SDK v7 and needs Node 22.12+ from v1.21.0
([SDK releases](https://github.com/temporalio/sdk-typescript/releases)). The Python SDK has an
[OpenAI Agents SDK integration](https://docs.temporal.io/develop/python/integrations/openai-agents.md).
The research found no Claude Agent SDK integration.

Temporal raised a $550M Series E at a $12.55B valuation on 2026-09-14, led by Lightspeed
([press release](https://am.gs.com/en-lu/advisors/news/press-release/2026/temporal-raises-550m-ai-infrastructure-demand)).
The licence is MIT.

## Restate

Restate has good primitives and the best Bun evidence of any engine. Its costs are a second log of
record, the BSL licence, and a pinned deployment for each long wait, unless handlers end at each
wait and continue in a new invocation. Server v1.7.13 shipped on 2026-10-01 and 1.8.0-rc.1 on
2026-10-02, and the TS SDK is at v1.17.2.

Restate runs as 1 binary with no outside database. The
[server overview](https://docs.restate.dev/server/overview.md) states: "Single-node Restate runs as
a single binary that persists data to disk", and "The log is the primary durability layer". RocksDB
is a local cache ([architecture reference](https://docs.restate.dev/references/architecture.md)).
Your SDK service runs as a separate HTTP process that you register as a "deployment".
[Release 1.8.0-rc.1](https://github.com/restatedev/restate/releases/tag/v1.8.0-rc.1) publishes Linux
musl binaries for x64 and arm64.

Bun support is documented and tested:

- The [SDK README](https://github.com/restatedev/sdk-typescript/blob/main/README.md) lists
  "NodeJS >= v22 or Bun or Deno".
- CI runs a `Bun.serve` example on the latest Bun on every PR
  ([compatibility workflow](https://github.com/restatedev/sdk-typescript/blob/main/.github/workflows/compatibility.yaml),
  [Bun test template](https://github.com/restatedev/sdk-typescript/blob/main/.github/workflows/_test-bun-template.yml)).
- You serve through the `@restatedev/restate-sdk/fetch` handler
  ([serving docs](https://docs.restate.dev/develop/ts/serving)).

Restate journals each `ctx.run` result, and the handler replays from the journal. Non-deterministic
code must go inside `ctx.run`. Failures retry until the code throws a `TerminalError`
([durable steps docs](https://docs.restate.dev/develop/ts/durable-steps)). A mismatch on replay
makes the invocation "fail loudly"
([versioning blog post](https://restate.dev/blog/dealing-with-versioning-in-long-running-agents)).

Restate offers 3 wait primitives
([external events docs](https://docs.restate.dev/develop/ts/external-events.md)):

- signals, resolved many times
- awakeables, resolved once by ID over HTTP, as in
  `curl localhost:8080/restate/awakeables/<id>/resolve`
- workflow promises

A suspended invocation holds no process: "Restate can suspend it and resume it when the next result
arrives." A workflow's handlers stay callable "for up to 24 hours (default)" after the run handler
ends.

The [configuration docs](https://docs.restate.dev/services/configuration.md) set these defaults:

- After 1 minute of inactivity, the server asks the handler to suspend.
- After 10 minutes, the server aborts a handler that has not suspended.
- Idempotency records last 24 hours, and each invocation takes an `idempotency-key`.

Virtual Objects allow one writer per key, with shared handlers for reads. A signal can go to an
invocation ID ([key concepts](https://docs.restate.dev/foundations/key-concepts.md)).

In-flight invocations stay on the old deployment. The
[versioning docs](https://docs.restate.dev/services/versioning.md) state: "Existing requests
continue on the original deployment." They advise: "Avoid long-running handlers (days or months) -
otherwise you need to keep old deployments around until all invocations complete." The admin API can
resume an invocation on another deployment, or restart it as a new invocation from part of its
journal ([llms.txt](https://docs.restate.dev/llms.txt)).

The server licence is BSL 1.1. It forbids only a "Public Restate Platform Service" and permits "Any
type of production deployment of Restate that is invoking services or workflows written by the
Licensee". It changes to Apache-2.0 4 years after each release
([LICENSE](https://github.com/restatedev/restate/blob/main/LICENSE)). The SDK is MIT.

Restate is active and funded:

- [1.7.0](https://restate.dev/blog/announcing-restate-1-7) shipped on 2026-07-07 with flow control.
- [1.8](https://github.com/restatedev/restate/blob/main/release-notes/v1.8.0.md) makes virtual
  queues the default and adds a `restate --json` CLI.
- Restate raised a $20M [Series A](https://restate.dev/blog/announcing-series-a) on 2026-09-30.
- The llms.txt index lists AI integrations for the Vercel AI SDK, the OpenAI Agents SDK, Google ADK,
  and others, but none for the Claude Agent SDK.

## DBOS Transact (TypeScript)

DBOS is the closest packaged match to an event log in Postgres, with no extra process. Its costs:

- its own schema and `pg` client beside Kysely
- no official Bun support
- waits that hold a process
- version-pinned recovery, which needs `applicationVersion` set by hand

The [README](https://github.com/dbos-inc/dbos-transact-ts) states: "DBOS provides lightweight
durable workflows built on top of Postgres." Queues, notifications, and schedules need "just
Postgres". `systemDatabaseUrl` accepts only a `postgresql://` URL, so the TypeScript library has no
SQLite support
([configuration reference](https://docs.dbos.dev/typescript/reference/configuration.md)).
[v5.0](https://github.com/dbos-inc/dbos-transact-ts/releases/tag/v5.0) removed the built-in admin
server.

DBOS does not support Bun officially. `engines` requires `node >=20`, and
[CI](https://github.com/dbos-inc/dbos-transact-ts/blob/main/.github/workflows/test.yml) tests Node
20, 22, and 24 only. People run it on Bun anyway:
[issue #1126](https://github.com/dbos-inc/dbos-transact-ts/issues/1126), "Production crash ... on
Bun 1.3.1+", opened 2025-11-25, was fixed in PR #1127.

DBOS stores each step's output in Postgres. A step runs at least once and never runs again after it
completes. A non-deterministic workflow throws `DBOSStepNondeterminismError`
([workflow tutorial](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial.md)).

DBOS waits and messages work as follows
([workflow communication](https://docs.dbos.dev/typescript/tutorials/workflow-communication)):

- `DBOS.sleep` is durable and can span days.
- "Each call to `recv()` waits for and consumes the next message", with a 60-second default timeout.
- `DBOS.send(workflowID)` delivers a message, and you can "specify an idempotency key for `send` to
  guarantee exactly-once delivery".
- `setEvent` and `getEvent` publish and read values that persist.
- The workflow ID is an idempotency key.

`recv` and `getEvent` poll Postgres from inside a live process, so a waiting workflow holds
resources. After a crash, recovery restarts the wait (configuration reference).

Recovery "only continues workflow execution with the same application version that started the
workflow". The default version is a hash of the source code. `DBOS.patch()` needs
`enablePatching: true`, and the docs recommend blue-green deploys
([upgrading workflows](https://docs.dbos.dev/typescript/tutorials/upgrading-workflows)).
`DBOS.forkWorkflow` restarts a workflow from a chosen step on a new version
([workflow management](https://docs.dbos.dev/typescript/tutorials/workflow-management.md)).

DBOS releases roughly weekly: v5.0 on 2026-09-16, which split inputs and outputs into their own
tables, and v5.2 on 2026-09-29. The latest funding found is an $8.5M
[seed round](https://www.citybiz.co/article/531361/dbos-raises-8-5m-seed-funding/) in March 2024.
The [llms.txt index](https://docs.dbos.dev/llms.txt) lists AI integrations for the Vercel AI SDK,
the OpenAI Agents SDK, and others, but none for the Claude Agent SDK. The licence is MIT.

## Inngest (self-hosted)

The Inngest step model fits nixie. Its costs are a server that pushes each step to nixie over HTTP,
the SSPL server licence, and no version pinning. Server v1.46.0 shipped on 2026-10-06, and the SDK
is at 4.22.0.

`inngest start` is 1 binary. By default it uses SQLite at `./.inngest/main.db` plus an in-memory
Redis. "Queue and state store snapshots are periodically saved to the SQLite database, including
prior to shutdown." Because the snapshots are periodic, a hard crash can lose recent queue state
(inferred). `--postgres-uri` and `--redis-uri` switch to external stores, and `--event-key` and
`--signing-key` are required. Self-hosted installs get no guaranteed support and no automatic
cleanup ([self-hosting docs](https://www.inngest.com/docs/self-hosting)).

Bun support is documented through `import { serve } from "inngest/bun"`
([serving docs](https://www.inngest.com/docs/learn/serving-inngest-functions)). The
[SDK README](https://github.com/inngest/inngest-js) states that it "works across browsers, Bun,
Deno, Node, and Cloudflare Workers".

The handler re-runs from the top, and completed `step.run` results return from memory by step ID
([execution docs](https://www.inngest.com/docs/learn/how-functions-are-executed)). SDK v4
checkpoints by default ([changelog](https://inngest.com/changelog/2025-12-10-checkpointing)).

Inngest waits on an event or a signal:

- `step.waitForEvent` documents no maximum
  ([reference](https://www.inngest.com/docs/reference/functions/step-wait-for-event)).
- Cloud plans allow waits of up to 1 year
  ([usage limits](https://www.inngest.com/docs/usage-limits/inngest)). The self-hosted limit is
  unknown.
- `step.waitForSignal` with `inngest.sendSignal` resumes exactly one run
  ([wait for signal docs](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-signal)).

An event ID and a function-level idempotency expression each deduplicate for 24 hours
([idempotency guide](https://www.inngest.com/docs/guides/handling-idempotency)).

Inngest has no versioning. In-flight runs execute new code, and a changed step ID makes that step
run again ([versioning docs](https://www.inngest.com/docs/learn/versioning)).

The server is SSPL 1.0 with an Apache 2.0 future licence
([LICENSE](https://github.com/inngest/inngest/blob/main/LICENSE.md)). The SDK package is Apache-2.0.
Releases come every 1–3 weeks. The $21M Series A from 2025-09 appears only in
[secondary sources](https://finder.techleap.nl/news/feed/inngest-raises-21m-to-boost-iteration).
Inngest has no Claude Agent SDK guide.

## Trigger.dev (self-hosted)

Trigger.dev does not fit: self-hosting takes 8 or more services and has no checkpoints. Version
v4.7.3 shipped on 2026-10-06.

The [Docker self-hosting guide](https://trigger.dev/docs/self-hosting/docker) lists these parts and
sizes:

- webapp side: Postgres, Redis, ClickHouse, Electric, S2-lite, and a Docker socket proxy
- worker side: the supervisor and the task containers, with a registry and MinIO shared
- suggested webapp size: 3+ vCPU and 6+ GB RAM
- suggested worker size: 4+ vCPU and 8+ GB RAM

The guide states that it alone is unlikely to give a production-ready deployment.

The [config file docs](https://trigger.dev/docs/config/config-file) state: "We currently only
officially support the `node` runtime". The `bun` runtime is experimental, at Bun 1.3.3. Some
OpenTelemetry instrumentation fails under Bun, and puppeteer and playwright break
([Bun guide](https://trigger.dev/docs/guides/frameworks/bun)).

Checkpoint/Restore In Userspace (CRIU) snapshots the whole process at waits
([how it works](https://trigger.dev/docs/how-it-works)). Self-hosted installs have no checkpoints,
because checkpoints are Cloud-only
([self-hosting overview](https://trigger.dev/docs/self-hosting/overview)).

Waitpoint tokens "pause task runs until you complete the token". The default timeout is `10m`, with
no maximum stated ([wait for token docs](https://trigger.dev/docs/wait-for-token)). Without
checkpoints, a self-hosted run that waits for days probably holds its container (inferred).
[Input streams](https://trigger.dev/changelog/input-streams) carry messages into a running task, and
a token completion is the other route in.

Trigger idempotency keys last 30 days by default, and Trigger.dev has no other idempotency keys
([idempotency docs](https://trigger.dev/docs/idempotency)). A run is locked to its deployed version
([versioning docs](https://trigger.dev/docs/versioning)).

Trigger.dev raised a $16M [Series A](https://trigger.dev/blog/series-a) on 2025-12-17. The licence
is Apache-2.0. A
[Claude Agent SDK guide](https://trigger.dev/docs/guides/ai-agents/claude-code-trigger) exists, but
it does not cover long sessions.

## Hatchet

Hatchet does not fit, because it does not support Bun workers. Version v0.110.5 shipped on
2026-10-06.

The [README](https://github.com/hatchet-dev/hatchet) states that Hatchet "uses Postgres as a
durability layer ... making it particularly easy to self-host".
[`hatchet-lite`](https://docs.hatchet.run/self-hosting/hatchet-lite) is a Go engine in 1 container
plus Postgres, and RabbitMQ is optional.

[Issue #1796](https://github.com/hatchet-dev/hatchet/issues/1796) was closed as not planned: "bun
isnt in our test matrix". [Issue #3926](https://github.com/hatchet-dev/hatchet/issues/3926), a Bun
build failure from 2026-05, is closed.

A durable task checkpoints into a durable event log: "every time a piece of a durable task
completes, it creates a new checkpoint (an entry in a durable event log)"
([durable execution docs](https://docs.hatchet.run/home/durable-execution)). Code must be
deterministic. Hatchet evicts a waiting task and frees its worker slot
([durable tasks docs](https://docs.hatchet.run/v1/durable-tasks)). `ctx.waitForEvent` takes a Common
Expression Language (CEL) filter and a lookback window
([durable event waits](https://docs.hatchet.run/v1/durable-event-waits)). Events reach a running
task, and the idempotency key is a CEL expression with a time to live (TTL).

Hatchet has no patching APIs. You deploy a new task definition and let old work drain
([Temporal migration guide](https://github.com/hatchet-dev/hatchet/blob/main/frontend/docs/content/docs/v1/from-temporal-to-hatchet.mdx)).

The licence is MIT. Hatchet was in
[YC Winter 2024](https://www.ycombinator.com/companies/hatchet-2), and the research found no
2025–2026 funding.

## Newer contenders

The engines from 2025–2026 are smaller and younger, and Absurd and OpenWorkflow are the reference
designs worth reading.

### Vercel Workflow

Version 5.1.0 shipped on 2026-10-06, and releases come near-daily. The
[README](https://github.com/vercel/workflow) states: "To self-host, use the Postgres backend or
implement a custom World". The
[Postgres World](https://github.com/vercel/workflow/blob/main/docs/content/worlds/v5/postgres.mdx),
`world-postgres`, runs on graphile-worker. It is a "reference implementation" with no authentication
on its routes.

Vercel Workflow replays inside a sandboxed VM. A run waits on hooks and webhooks, and
`resumeHook(token)` delivers a message into it. `stepId` is the idempotency key.

Self-hosted runs are not pinned to their deployment: `getDeploymentId()` always returns `'postgres'`
([`queue.ts`](https://github.com/vercel/workflow/blob/main/packages/world-postgres/src/queue.ts#L381)).

The approval path has open bugs:

- [#4173](https://github.com/vercel/workflow/issues/4173): concurrent ownership of one hook token
- [#4244](https://github.com/vercel/workflow/issues/4244): `close()` resolving while a job runs

Bun is a worked example only, not tested in CI. The licence is Apache-2.0.

### Absurd

Version 0.5.0 shipped on 2026-08-04. Absurd is "entirely based on Postgres and nothing else",
installed as one `absurd.sql` file, with pull-based workers
([repo](https://github.com/earendil-works/absurd),
[announcement](https://lucumr.pocoo.org/2025/11/3/absurd-workflows/)).

Absurd checkpoints steps, and tasks can sleep or suspend for events. "Events are cached (first emit
wins), which means they are race-free." `emitEvent` sends an event, and `ctx.awaitEvent` frees the
worker
([TypeScript SDK docs](https://github.com/earendil-works/absurd/blob/main/docs/sdks/typescript.md)).
Spawn takes idempotency keys. Absurd has no versioning, and its Bun support is not stated.

Absurd documents a
[durable message-log pattern](https://github.com/earendil-works/absurd/blob/main/docs/patterns/pi-ai-agent.md)
for agent turns.

The repo has had no push since 2026-08-10, and its author calls it "an experiment in durability".
The licence is Apache-2.0. Absurd is a reference design to borrow from, not a dependency.

### OpenWorkflow

Version 0.10.1 shipped on 2026-09-16, and it is pre-1.0. Stateless workers poll a SQLite or Postgres
backend. OpenWorkflow "Supports Node.js and Bun", and
[CI](https://github.com/openworkflowdev/openworkflow/blob/main/.github/workflows/ci.yaml) has a
`ci-bun` job.

OpenWorkflow checkpoints steps (unverified), and its idempotency is unverified. A signal reaches a
waiting run. A signal sent while no run is waiting is dropped. Versioning lives in code, through a
`version` argument
([architecture doc](https://github.com/openworkflowdev/openworkflow/blob/main/ARCHITECTURE.md)).

The licence is Apache-2.0. OpenWorkflow is the best reference design to read next to Absurd.

### TanStack Workflow

Version 0.0.4 shipped on 2026-07-21. The [docs](https://tanstack.com/workflow/latest/docs) state:
"State is derived — reconstructed by replaying the log + re-running the handler." The runtime is
"experimental", and the Postgres store uses Drizzle
([overview](https://github.com/TanStack/workflow/blob/main/docs/overview.md)). D1 is the other
store.

A run waits through `waitForEvent` or `approve`, and `deliverSignal` sends a message into it.
`stepCtx.id` is the idempotency key, and `previousVersions` handles versioning. Bun support is not
stated. The licence is MIT.

### Resonate

Resonate is 0.x: server v0.9.8, and TS SDK 0.11.5 from 2026-09-03. It is
[one Rust server](https://github.com/resonatehq/resonate/blob/main/impl/server/core/README.md) on
SQLite or Postgres. The SDK requires Node 22+
([`package.json`](https://github.com/resonatehq/resonate/blob/main/impl/sdk/ts/package.json)).

Resonate builds on durable promises. A run waits on `ctx.promise`, and whether that releases the
worker is unverified. A message resolves a promise by ID. The execution ID is the idempotency key,
and `register(fn, name, version)` handles versioning. The licence is Apache-2.0.

### Convex and pgflow

Neither fits. Convex self-hosted is FSL-1.1
([LICENSE](https://github.com/get-convex/convex-backend/blob/main/LICENSE.md)). pgflow needs
Supabase Edge Functions on Deno.

## The Claude Agent SDK inside an engine

The SDK session serves as the turn's checkpoint, and `defer` serves as the approval wait, with
limits on both.

### Version and runtime

The latest TS SDK is v0.3.292, released 2026-10-06. Since v0.2.113, the SDK spawns a native Claude
Code binary for each session
([CHANGELOG](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)).

Bun probably works, but it is not documented, and the SDK spike settles it:

- The [quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart) lists "Node.js 18+".
- v0.3.144 added an `extract` export for `bun build --compile` users, and an earlier release fixed a
  crash inside compiled Bun binaries (CHANGELOG).
- Anthropic [acquired Bun](https://bun.com/blog/bun-joins-anthropic) on 2025-12-02 and named the
  Agent SDK among the products Bun powers.

### SessionStore as the turn's checkpoint

The [session storage docs](https://code.claude.com/docs/en/agent-sdk/session-storage) set out when
the store runs and what it keeps:

- `append` runs "After each batch of transcript entries is written locally". `load` runs before the
  subprocess spawns when `resume` is set.
- Writes are best-effort. The SDK tries a failed `append` up to 3 times in total. The SDK then emits
  `mirror_error`, "drops the batch, and continues the query". Deduplicate by `entry.uuid`.
- A run resumed from the store deletes its local copy at the end, "so the store holds the only
  durable copy". A batch dropped on such a run "has no surviving copy".
- `persistSession: false` and `enableFileCheckpointing` both conflict with a store.

On one host with a persistent disk, the local JSONL under `CLAUDE_CONFIG_DIR` is durable on its own.
The store adds resume on another host, not extra durability. The `cleanupPeriodDays` sweep deletes
local transcripts after 30 days by default, and a parked task can outlive that
([hooks docs](https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later)).

### Approval waits

`canUseTool` "can stay pending indefinitely", but only while the process stays alive. For long
waits, the user input docs say to use a `PreToolUse` hook that returns `defer`, "so the process can
exit and resume later from the persisted session".

The [hooks docs](https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later) set these limits
on `defer`:

- "`defer` only works when Claude makes a single tool call in the turn. If Claude makes several tool
  calls at once, `defer` is ignored with a warning and the tool proceeds through the normal
  permission flow."
- When the tool is missing on resume, the run ends with `tool_deferred_unavailable`, for example
  when the tool's Model Context Protocol (MCP) server is not connected.
- A `-p` resume does not restore the stored permission mode, so pass it again.

Hook decisions follow a precedence order: "`deny` takes priority over `defer`, which takes priority
over `ask`, which takes priority over `allow`"
([SDK hooks docs](https://code.claude.com/docs/en/agent-sdk/hooks)).

### Owner messages mid-task

`streamInput()` queues a message into a running query, and `interrupt()` returns a receipt that
lists the `still_queued` messages (TypeScript reference). The live query is not durable, so nixie
writes each owner message to its event log first. After a crash, any message that no finished turn
used goes in as the prompt of the resumed turn.

### Idempotency

A deferred call keeps its pending tool call "preserved in the transcript", and the same call fires
`PreToolUse` again on resume (hooks docs). Its `tool_use_id` is therefore the natural idempotency
key across a defer and resume. Whether that ID survives a crash and resume is untested. The
recommended design does not depend on it.

## Recommendation

Build the durable layer on nixie's own event log, with Kysely and Postgres. Borrow the semantics of
Absurd, OpenWorkflow, and DBOS, and do not adopt an engine yet.

1. **Use explicit state machines, not replayed code.**
   - Each long-lived task moves through states such as `running_turn`, `waiting_approval`,
     `waiting_message`, `sleeping`, and `done`.
   - Each step is one row keyed by `(task_id, step_key)`.
   - A worker takes a lease on the task, runs the next step, and writes the result and the next
     state in one transaction.
   - No code replays, so a deploy cannot break a parked task. Only the state names and their
     payloads must stay readable.
2. **Run one turn as one step.**
   - The step runs `query()` with `resume: sessionId` and ends at `result`, and the SDK session is
     the turn's checkpoint.
   - On one host, keep `CLAUDE_CONFIG_DIR` on a persistent volume and raise `cleanupPeriodDays`.
   - Add the Postgres `SessionStore` adapter when a second host appears.
3. **Run outside actions in nixie, not in the SDK subprocess.**
   - Each outside action is an in-process MCP tool that asks the policy decision point.
   - An allowed action runs once, under a proposal ID that nixie creates.
   - nixie records an action that needs approval as a proposal, and the tool returns "pending
     approval as <id>" to the model.
   - On approval, nixie runs the action as its own step under the same ID, then starts a new turn
     with the result.

   This design gets around the `defer` limit on parallel calls, keeps every outside action in
   nixie's record, and does not depend on `tool_use_id` surviving a crash. Its cost is that the
   model learns the outcome in a later turn, not in the same one.

4. **Use `defer` only for `AskUserQuestion`** and other single questions to the owner, where
   parallel calls are rare.
5. **Treat owner messages as events.** Write each message to the log first. Then `streamInput()` it
   into the live session if one exists, or queue it for the next turn.

### Why not an engine

Three reasons rule out an engine for now:

- Bun: only Restate and OpenWorkflow test Bun in CI, and Inngest documents a Bun adapter. Temporal
  and Trigger.dev call Bun experimental. DBOS, Hatchet, and Vercel Workflow do not support it
  officially.
- A second log: every engine adds a second log of record next to nixie's event log. The two logs can
  disagree, and the policy decision point must then reconcile them.
- Versioning: nixie deploys often, and tasks park for days. Temporal and DBOS need patches. Restate
  keeps the old deployment up until its invocations finish. Inngest and self-hosted Vercel Workflow
  run new code against old runs with no pinning. An explicit state machine avoids all of these.

### Trade-off

The hand-rolled layer costs code and correctness work that an engine has done. The estimate is
800–1,500 lines for leases, timers, retries, wake-ups, and a run viewer, plus crash tests. The risk
is subtle bugs in leases and wake-ups. If that cost proves too high, these are the fallbacks:

- Restate comes first. It has the best Bun evidence, tested in CI, plus 1 binary, a single-writer
  mailbox per key, and new funding. Its costs are the BSL licence and deployment pinning, so end
  handlers at each wait.
- DBOS comes second. It uses the same Postgres with no extra process, under MIT. Its costs are waits
  that hold a live process and Bun support that is not official. Pin `applicationVersion` by hand.
- OpenWorkflow is worth a spike if a library with SQLite and CI-tested Bun matters more than
  maturity.

## Worth borrowing

- explicit state machines with one row per `(task_id, step_key)`, borrowed from the semantics of
  Absurd, OpenWorkflow, and DBOS
- one turn as one step, with the SDK session as the turn's checkpoint
- `defer` and resume for single questions to the owner
- owner messages written to the event log before `streamInput()`
- proposal IDs that nixie creates as the idempotency key for outside actions
- Restate and DBOS as fallbacks if the hand-rolled layer costs too much

## Worth avoiding

- adopting an engine now, with a second log of record beside nixie's event log
- replayed workflow code that a deploy can break while a task is parked
- `canUseTool` pending inside one long activity
- `defer` for outside actions, where parallel calls make it unreliable
- the `cleanupPeriodDays` default of 30 days for parked tasks

## Open questions

1. Does `tool_use_id` stay the same after a crash and resume, not only after a defer and resume?
   Test it by killing the subprocess mid-tool, resuming, and comparing the IDs. The recommended
   design does not depend on the answer, because nixie creates its own proposal IDs.
2. How often does the model make parallel tool calls in nixie's workloads? The answer sets how much
   the `defer` path matters.
3. Does the Agent SDK run under Bun with nixie's full feature set: in-process MCP tools, hooks, and
   `streamInput`? The SDK spike settles this.
4. Should the event log use Postgres or SQLite? Kysely's core SQLite dialect expects a
   `better-sqlite3`-style driver, and `kysely-bun-sqlite` 0.4.0 dates from 2025-05.
   `kysely-postgres-js` is the safer path on Bun
   ([Kysely dialects](https://kysely.dev/docs/dialects)).
5. When the host restarts mid-stream, the unfinished model call is lost, and the turn restarts from
   the last saved batch. Can the resumed turn repeat an outside action that already ran? The
   proposal ID guards against this, and a test still has to confirm it.
