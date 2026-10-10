# Connectors

- Status: Proposed
- Decisions: [0030](../../decisions/0030-connectors-and-sandbox-environments.md),
  [0005](../../decisions/0005-effects-and-taint.md), [0014](../../decisions/0014-search.md),
  [0016](../../decisions/0016-own-interfaces.md),
  [0019](../../decisions/0019-connector-authorization.md),
  [0020](../../decisions/0020-deployment.md),
  [0021](../../decisions/0021-outside-action-outcomes.md),
  [0022](../../decisions/0022-coding-and-code-execution.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

A connector is nixie's code for one outside service, such as Gmail or a search API. It gives nixie
typed tools with declared effects, the polls a trigger source runs against the service, the
authorization the service needs, and the steps the owner follows to set it up, under
[0016](../../decisions/0016-own-interfaces.md). A connection is one connector with one of the
owner's accounts and its credential, so an owner with 2 Gmail accounts has 2 connections of one
connector. Each owner registers their own OAuth client with each provider, and nixie ships none,
under [0019](../../decisions/0019-connector-authorization.md). Everything in this doc beyond the
decisions it links is a proposal.

## The interface

A connector declares what it offers, and nixie's core calls it. The shape below is a sketch in
TypeScript.

```ts
interface Connector {
  id: string; // such as 'google'
  auth: OAuthSpec | StaticSpec | { kind: 'none' };
  setup: SetupStep[];
  actions: ConnectorAction[]; // each becomes a nixie tool
  polls?: PollSpec[]; // for the trigger source
  check(connection: Connection, context: ConnectorContext): Promise<HealthReport>;
}

interface ConnectorAction<Input = unknown, Output = unknown> {
  tool: Omit<ToolDefinition<Input, Output>, 'run'>;
  scopes: string[]; // the provider scopes the action needs
  reconcile?: Reconcile; // for queued actions
  run(call: ActionCall<Input>, context: ConnectorContext): Promise<ActionResponse<Output>>;
}

type Reconcile =
  | { kind: 'idempotency_key'; where: string; keptFor: string }
  | { kind: 'check'; action: string; settleAfter: string }
  | { kind: 'none' };

type ActionResponse<Output> =
  | { kind: 'done'; result: Output }
  | { kind: 'refused'; reason: string } // guarantees no effect
  | { kind: 'retry'; reason: string; after?: string } // no effect, may clear
  | { kind: 'ambiguous'; reason: string }; // the action may have happened
```

Each action becomes one of nixie's tools, defined as [tools](./tools.md#a-tool-definition) sets out,
with an argument that names the connection when the owner has more than one. The policy decision
point owns the declaration each tool carries: its effects, its destination, amount and free-text
arguments, and the source of each result field
([decision point](../policy/decision-point.md#effects)). A tool's effects never depend on its
arguments, so a capability whose effects differ splits into actions, such as moving an email to the
trash and sending one.

The connector maps each provider response to one of the 4 responses, and the
[outside action queue](../core/outside-actions.md#attempts-and-outcomes) turns them into outcomes.
Each queued action declares how to reconcile an unknown outcome, as
[0021](../../decisions/0021-outside-action-outcomes.md) requires: the provider's idempotency key and
how long the provider keeps it, a read-only check and how long to wait before trusting a negative
answer, or neither. `run` receives the action ID and the attempt number, and passes the action ID as
the idempotency key or writes it where the check finds it, such as a header on a sent email.

`ConnectorContext` gives the connector a [fetcher](./credentials.md#the-interface) for the
connection's credential, limited to the hosts the connector declares, and nothing else that reaches
the network. A poll in `polls` supplies the call and the cursor that the
[trigger source](../channels/trigger-source.md#polls) runs, and runs under the connector's read
effect.

Connectors are nixie code in workspace packages, under
[0025](../../decisions/0025-database-and-topology.md), never MCP servers. **Why:** the owner's
tokens then never leave nixie's process, and each connector's effects, results and reconciliation
are reviewed code instead of a server's claims.

## Setting up a connection

The client walks the owner through each connector's setup steps, under
[0019](../../decisions/0019-connector-authorization.md). A connector declares its steps as data, and
the client renders each one: an instruction with a link to the provider's console, a field the owner
fills, or an action nixie runs.

1. **Register a client.** The owner creates an OAuth client in the provider's console, following the
   connector's instructions, with nixie's redirect URI, and pastes the client ID and secret into the
   client. nixie stores them as an `oauth_client` credential in the database backend.
2. **Consent.** nixie opens the provider's consent page with PKCE, the scopes of the actions the
   owner switched on, and a `state` value bound to the owner's session. The provider redirects back,
   and nixie exchanges the code for tokens and stores them as an `oauth_token` credential.
3. **Check.** nixie runs the connector's `check`, which makes one read call per scope, and records
   which scopes the provider granted.
4. **Switch on.** The connection's tools join the registry, and its polls start.

A provider may grant fewer scopes than nixie asked for. Google shows each scope as its own checkbox
at consent, so the owner can untick one. nixie compares the granted scopes with each action's
`scopes`, and leaves out every action whose scope is missing, with a notice that names them.
**Why:** a tool that fails on every call because of a missing scope reads to the model as a broken
service, while a missing tool reads as a missing capability.

A static credential, such as an IMAP app password or an API key, skips the first 2 steps: the owner
pastes it into the client, or the deployment supplies it.

### The redirect

Google sends the owner's browser back to nixie's HTTPS origin with the authorization code. Setup
uses a Web application OAuth client and an exactly registered callback URL. nixie binds the consent
request to the device session with `state` and PKCE, exchanges the code on the host and completes
setup in the client. The expected deployment supplies HTTPS on a fixed name.

[Google's redirect rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation)
require HTTPS, a host name and an exactly registered URL. These published rules fit the expected
origin; accepting the actual private-network URL still needs a live registration and consent check.

The [Google spike](../../../spikes/google-oauth/README.md) uses a Desktop client and a working
localhost callback. That client cannot substitute for the web client. A failed-localhost URL pasted
into nixie is untested and is not part of the agreed first setup flow.

## Google

The first connector covers Gmail, Google Calendar and Google Drive with one owner-registered OAuth
client, under [0030](../../decisions/0030-connectors-and-sandbox-environments.md). The Google OAuth
spike set up an unverified client in production and consented to `gmail.modify`, a restricted scope,
with `calendar.events` and `drive.file`; every API answered on day 0. Setup takes these steps in
Google Cloud:

1. Create a project, and enable the Gmail, Calendar and Drive APIs.
2. Configure the consent screen as External, with an app name and the owner's email address.
3. Give the app a home page URL and a privacy policy URL on the Branding page, which publishing
   requires. The owner points both at a page they control.
4. Publish the app to production with no test users, then create the OAuth client.

The app stays out of testing status, which expires consent after 7 days. Whether the token from a
production client outlives those 7 days is the refresh on day 8 that
[open items](../open-items.md#spikes-to-run) lists. If it fails, mail falls back to IMAP with an app
password under [0019](../../decisions/0019-connector-authorization.md), and Calendar and Drive keep
OAuth, because Google's CalDAV refuses passwords.

`drive.file` covers files nixie creates and files the owner explicitly selects for it, not every
file in Drive. The setup and tools show that scope boundary, under
[Google's Drive scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

`gmail.modify` reads, labels, archives, trashes and sends mail, and cannot delete a message for
good, which needs the full `https://mail.google.com/` scope. The Google connector therefore offers
no `delete` action for mail. **Why:** a purge needs a scope that also grants IMAP access, and moving
to the trash is restorable for 30 days.

The Gmail poll uses the history ID as its cursor, as the
[trigger source](../channels/trigger-source.md#polls) sets out. Each sent message carries the action
ID in a header, so a check after an unknown outcome searches the Sent folder for it, as
[outside actions](../core/outside-actions.md#reconciliation-per-connector) describes.

## Search

Search is one of nixie's own tools, with Kagi as its first provider, under
[0014](../../decisions/0014-search.md). The search tool is a connector whose actions call a provider
adapter, so SearXNG or another provider can follow behind the same tool.

```ts
interface SearchProvider {
  id: string; // such as 'kagi'
  search(query: string, options: { limit: number }): Promise<SearchHit[]>;
}

interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
}
```

The tool declares the `fetch` effect and returns full results, with titles and snippets. Every
field's source is outside content, and only `publishedAt` is an endorsed type, because a URL can
hold text in its path, under 0014. The tool returns 10 hits by default, and the caller may ask for
up to 25.

Kagi charges about $0.012 per search, and the tool writes each search's cost on the call's record,
so the live view shows what search costs. The [budgets](../policy/budgets.md) count `spend` tools
and model cost, and neither covers a paid read such as a search, so
[open items](../open-items.md#phase-3-design-tasks) lists a budget for paid tool calls. The Kagi API
key is a static credential in the deployment backend.

## Agreed connector choices

[0030](../../decisions/0030-connectors-and-sandbox-environments.md) records the owner choices:
reverse forwards for an imp's tools with egress `none`; Google first; an automatic HTTPS OAuth
return with a Web application client; the v2 MCP packages for nixie; imp as the first sandbox
implementation with a deferred container sketch; and a familiar Linux code environment with Node.js,
Python and common command-line tools.

The private-network callback registration and the Google refresh on day 8 remain validation work,
not open provider or redirect choices. The image inventory and its versions need a build-time check
against representative agent programs, under [open items](../open-items.md#spikes-to-run).
