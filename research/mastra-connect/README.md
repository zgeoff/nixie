# Spike: Mastra Connect as a reference for the connector designs

This spike reads Mastra Connect, a hosted service with an open client package that gives Mastra
agents tools on outside services. It compares each part with nixie's
[connector designs](../../docs/design/platform/connectors/README.md) and the
[trigger source](../../docs/design/platform/channels/trigger-source.md), and lists the ideas worth
adapting. Mastra stays a reference: nothing here proposes a dependency on it.

- `@mastra/connect` 1.0.1 on npm, and the source of `packages/connect/` on `mastra-ai/mastra` at
  commit
  [`c90a4b7`](https://github.com/mastra-ai/mastra/tree/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect),
  which is version `1.0.2-alpha.0`
- The [announcement](https://mastra.ai/blog/introducing-mastra-connect), 7 October 2026, and the
  Connect docs on mastra.ai
- The
  [Mastra and Agent SDK note](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.1-notes/mastra-and-agent-sdk.md)
  from the research archive, which covers `@mastra/core` 1.74.0 and predates Connect

## Question

How does Mastra Connect model a connector, store and refresh credentials, expose tools to the model,
and handle errors and rate limits, and which of its choices would improve nixie's connector designs?

## Run it

Nothing runs. The spike installed no Mastra package, because the `@mastra` npm scope was compromised
in June 2026, as the research note records. It read the docs, the announcement, the npm metadata and
the client source through the GitHub API.

## What Connect is

Connect has 2 parts. The open part is the `@mastra/connect` client, declared Apache-2.0, which an
app imports to get tools. The closed part is the Mastra platform at `integrations.mastra.ai`, which
holds the connections, runs the OAuth apps, stores the credentials and proxies every tool call
([overview](https://mastra.ai/docs/mastra-platform/connect/overview),
[`src/client.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/client.ts)).
An app can run anywhere, but it needs a platform project, so Connect has no self-hosted form.

Nango sits underneath, although the docs never name it. The tool code under `src/providers/` is
generated from Nango's integration templates, pinned by commit, under the Elastic License 2.0
([`NOTICE.md`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/NOTICE.md)).
A comment in the client source has the platform "strip it before Nango injects the provider
credential upstream"
([`src/client.ts` line 173](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/client.ts#L173)).
The announcement claims 23 providers, almost 900 tools and 7 hosted MCP providers.

## The connector model

Connect splits a provider, the definition of one service, from a connection, one authorised account
on that provider ([overview](https://mastra.ai/docs/mastra-platform/connect/overview)). nixie makes
the same split between a connector and a connection. A Connect connection belongs to an organisation
and attaches to projects, and the source carries the request context only "once user-scoped
connections are supported"
([`src/runtime/platform-proxy.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/runtime/platform-proxy.ts)).

Each provider is checked-in generated TypeScript: a registration, one tool per action with Zod input
and output schemas, and a manifest that holds the template commit, the tool count and a SHA-256 hash
per file
([Linear provider](https://github.com/mastra-ai/mastra/tree/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/providers/linear)).
The package's agent guide treats the templates as untrusted vendored code, asks for a security
review on every template bump, and requires a live smoke test that covers every tool of a provider
([`AGENTS.md`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/AGENTS.md)).

A Connect tool declares no effects, so nothing records whether it reads, writes or sends. Each nixie
connector action carries an effect declaration, its scopes and a reconciliation rule, which the
decision point and the action queue act on.

## Auth and credential storage

The platform owns the OAuth clients, so a developer connects an account "without you creating vendor
apps" ([platform overview](https://mastra.ai/docs/mastra-platform/overview)). OAuth opens the
provider's consent screen in a browser, and an API key is typed into the CLI
([CLI reference](https://mastra.ai/reference/cli/mastra)). The docs say the platform "stores and
rotates" credentials, and say nothing about encryption at rest, PKCE, scopes or bringing your own
client ([channels](https://mastra.ai/docs/mastra-platform/connect/channels)).

The app holds only a platform token, and the client removes any `authorization` header a tool sets,
so a tool cannot replace the platform's auth
([`src/client.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/client.ts)).
Beside the proxy, `credential()` returns the raw access token or API key to app code, outside the
proxy's audit ([reference](https://mastra.ai/reference/connect/credential)).

nixie differs on both points by design. You register your own OAuth client, the database backend
encrypts each credential with a key of its own, and no code path returns a token to a connector: the
[fetcher](../../docs/design/platform/connectors/credentials.md#the-interface) adds the credential on
the host. The fetcher limits hosts, drops the credential on a cross-host redirect and checks every
address, but it says nothing about a header the connector sets itself.

## Token refresh

The platform proxy refreshes OAuth tokens, and the client holds no refresh code
([overview](https://mastra.ai/docs/mastra-platform/connect/overview)). The docs do not say whether
refresh runs before expiry or on a failed call. A caller of `credential()` checks `expiresAt` and
asks again.

A refused refresh marks the connection `needs_reauth`. The tool resolver then skips that provider
with a `console.warn` and loads the others
([`src/tools.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/tools.ts),
[tools reference](https://mastra.ai/reference/connect/tools)). The tools disappear, and neither the
model nor the end user learns why.

nixie's [refresh](../../docs/design/platform/connectors/credentials.md#refresh) runs on the host
before expiry, refreshes every token at least weekly, serialises refreshes per credential and writes
a rotated refresh token in the refresh's own transaction. A refusal for good marks the credential
`needs_consent`, removes its tools and puts a consent item in the client. nixie tells you; it does
not tell the model, which sees the same missing tool that Connect leaves.

## Tool exposure

The `tools()` resolver returns a flat record of tools named `<provider>_<action>`, such as
`linear_create_issue`, and Mastra calls it on every generation
([`src/tools.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/tools.ts)).
With no options it returns every tool of every connected provider. It caches the set for 30 s, and
after a failed fetch keeps the last set and waits 30 s before trying again. There is no tool search,
so filtering is the only way to keep 900 tools out of a prompt.

- **Filtering.** A caller passes providers and `allowTools` or `disallowTools` globs. A per-provider
  glob that matches no tool fails with `invalid_options`, "so a typo never silently widens access"
  ([`src/toolset.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/toolset.ts)).
- **Approval.** `requireApproval` takes `true` or a list of tool names and hands each one to
  Mastra's approval flow. The default asks for nothing.
- **Several accounts.** When a provider has 2 or more active connections, Connect adds a
  `<provider>__list_connections` tool, and every other tool of that provider gains a required
  `connection_name` argument. Names come from the account label, and a label that repeats or matches
  another connection's raw ID gets the ID as a suffix, so each name selects exactly one account
  ([`src/multi-connection.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/multi-connection.ts)).

nixie's [tool endpoint](../../docs/design/platform/connectors/tools.md#one-endpoint-per-task-run)
lists only the caller's tools for each run, and the decision point checks every call against each
tool's effect declaration, so nixie needs neither Connect's cache nor its glob filters. nixie's
connector design gives an action "an argument that names the connection when more than one exists",
and leaves open what the argument holds and how the model learns the choices.

## Errors and rate limits

Every error is a `MastraConnectError` with a `code`, an HTTP `status` and a `detail` drawn from the
provider's error body and cut at 2000 characters
([`src/errors.ts`](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/errors.ts)).
The client tells the platform's own errors from the provider's by the `application/problem+json`
content type.

A tool retries only a network error or a 5xx, up to the template's count and at most 5 times, with
no wait between attempts. It retries only `GET`, `HEAD`, `PUT` and `DELETE`, or a `POST` or `PATCH`
that carries an `Idempotency-Key` header, and gives any other write exactly one attempt
([`src/runtime/platform-proxy.ts` lines 214 to 219](https://github.com/mastra-ai/mastra/blob/c90a4b7c71a83f14ec49812721f25e01f909729a/packages/connect/src/runtime/platform-proxy.ts#L214-L219)).
The client has no handling for a 429, `Retry-After`, a quota or a per-call timeout, and a comment
defers to a platform retry policy the docs never describe.

nixie's [action queue](../../docs/design/platform/core/actions.md) covers queued writes with 4
response kinds, a retry schedule that honours the provider's retry time, and reconciliation. Like
Connect, it never repeats a write blindly: an unknown outcome leads to reconciliation, never to a
plain second attempt. The designs say less about a `direct` call, a read in the turn: neither the
[tool endpoint](../../docs/design/platform/connectors/tools.md#what-the-model-sees) nor the
connector interface states what a rate-limited or failed read returns to the model.

## Triggers

Connect has no triggers for tool providers, only webhook routes for its chat channels
([channels reference](https://mastra.ai/reference/connect/channels)). nixie's
[trigger source](../../docs/design/platform/channels/trigger-source.md) polls with a cursor
committed beside its events, so Connect offers nothing to adapt here.

## Ideas worth adapting

### 1. The connection argument

Connect's `connection_name` shows what nixie's connection argument leaves open: the values, how the
model learns them, and what happens when 2 labels collide. The change goes to
[Connectors: the interface](../../docs/design/platform/connectors/connector.md#the-interface).

- **Outcome:** the connector design states what the connection argument holds and how the model
  chooses an account.
- **Scope:** the argument's values, such as an enum of unique labels or short IDs from
  `createShortID`, never connection UUIDs; label collisions; when the argument appears and the
  schema change that adds a second account; a pinned connection in a job definition.
- **Acceptance:** the interface section names the argument's form, a collision rule and the case of
  one connection, and the policy and tools designs agree.

### 2. A connection status the model can see

Connect and nixie both drop a tool whose connection needs consent, so the model cannot tell a lapsed
account from a missing capability. How the assistant answers "send that email" while Gmail waits for
consent is a choice about how nixie feels to use, so you decide it. The change goes to
[the credential store: statuses](../../docs/design/platform/connectors/credentials.md#statuses) and
[Serving nixie's tools: one endpoint per task run](../../docs/design/platform/connectors/tools.md#one-endpoint-per-task-run).

- **Outcome:** the designs state what the model learns about a connection that is `needs_consent`,
  `failing` or `disconnected`.
- **Scope:** options such as a line in the conversation's context, a stub tool that returns the
  status, or nothing; which statuses show; jobs as well as the conversation.
- **Acceptance:** the owner picks an option, and both sections state it with its reason.

### 3. What a failed read returns

Connect's errors carry a provider detail, capped, and tell the platform's errors from the
provider's. nixie's designs state this for queued actions, not for `direct` reads. The change goes
to
[Serving nixie's tools: what the model sees](../../docs/design/platform/connectors/tools.md#what-the-model-sees)
and [Connectors: the interface](../../docs/design/platform/connectors/connector.md#the-interface).

- **Outcome:** the designs state what a `direct` call returns when the provider rate-limits it,
  fails it or times out.
- **Scope:** retries in the turn and their limit against the provider's retry time; the error the
  model sees; provider error text as capped outside content; a fetcher refusal, such as a removed
  binding or a refused host, told apart from a provider's answer.
- **Acceptance:** the outcome table gains the failure rows, and each row names its retry rule and
  the content source of its text.

### 4. Headers the connector sets

Connect strips any `authorization` header a tool sets, so a tool cannot send a credential of its own
choosing. nixie's fetcher adds the credential, but the design does not say what happens to an auth
header the connector has set, such as one built from a tool argument. The change goes to
[the credential store: the interface](../../docs/design/platform/connectors/credentials.md#the-interface).

- **Outcome:** the fetcher's contract states how it treats a connector's own auth headers.
- **Scope:** `Authorization`, `Cookie`, `Proxy-Authorization` and the header a static credential
  uses; refuse or replace.
- **Acceptance:** the interface section names the headers and the rule, with its reason.

### 5. A failed listing on the MCP proxy

Connect keeps its last tool set when a fetch fails and waits before it tries again. nixie's proxy
lists a server's tools at the start of every task run, and the design does not say what a run gets
when that listing fails. The change goes to
[the MCP proxy: pinning](../../docs/design/platform/connectors/mcp-proxy.md#pinning).

- **Outcome:** the proxy design states what a task run sees when a server's listing fails.
- **Scope:** keep or hide the pinned tools; the server's health and backoff; the client notice.
- **Acceptance:** the pinning section gains the case with its reason.

## Ideas left out

- **Platform-owned OAuth clients.** They save the setup step, but they put your tokens in a third
  party's cloud, and nixie ships no OAuth client on purpose.
- **A raw credential call.** `credential()` hands app code a live token outside the audit. nixie's
  fetcher exists so that a connector never reads a token.
- **Generated connectors from vendored templates.** Connect pays for 900 tools with a review on
  every template bump, and with code whose licence bars a hosted service that offers a substantial
  set of its features. nixie writes a few connectors as reviewed code, with effects and
  reconciliation that templates lack.
- **Tool filter globs that fail closed.** A nixie tool list names each tool, so a typo narrows it.
- **Stripping secret fields from results.** A nixie tool's output schema picks its fields, so a
  provider's secret field reaches the model only when an action names it.
- **A live smoke test of every tool.** It needs a real account and real writes, and a rule for live
  provider tests belongs to the testing rules, not the connector design.

## What it left untested

The platform's refresh timing, retry policy, rate-limit handling and storage are closed and
undocumented, so this note describes them only as far as the docs do.
