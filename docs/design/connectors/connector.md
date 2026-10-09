# Connectors

- Status: Proposed
- Decisions: [0005](../../decisions/0005-effects-and-taint.md),
  [0014](../../decisions/0014-search.md), [0016](../../decisions/0016-own-interfaces.md),
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

The provider sends the owner's browser back to nixie with the authorization code. Two routes work,
and the third owner decision below asks which one setup uses first:

- **A web client** with a redirect to the client's own HTTPS origin, such as the address Tailscale
  serves under [0020](../../decisions/0020-deployment.md). The redirect completes setup with no
  extra step. It needs an HTTPS origin that the provider accepts as a redirect URI.
- **A desktop client** with a loopback redirect, which the
  [Google OAuth spike](../../../spikes/google-oauth/README.md) used. The browser that consents is
  rarely on nixie's host, so the redirect page fails to load, and the owner copies its URL from the
  address bar into the client. It works for any deployment.

## Google

The first connector, under the second owner decision below, covers Gmail, Google Calendar and Google
Drive with one OAuth client. The Google OAuth spike set up an unverified client in production and
consented to `gmail.modify`, a restricted scope, with `calendar.events` and `drive.file`; every API
answered on day 0. Setup takes these steps in Google Cloud:

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

## Decisions for the owner

These 6 choices are the connector design's open decisions, each with a recommendation. The rest of
the connector docs assume the recommendation.

1. **The route from an imp to nixie's tools.** Every model loop runs in an imp under
   [0026](../../decisions/0026-where-workers-and-the-conversation-run.md), and needs a route to
   nixie's tools on the host that does not reach imp's management API.
   - Options: a reverse forward from the imp's loopback to nixie, over the guest agent's vsock; a
     port-level allow entry, a change to imp; or nixie's endpoint on an address that serves nothing
     else.
   - Recommendation: the reverse forward, which
     [the sandbox adapter](./sandbox-adapter.md#the-route-to-nixies-tools) describes. imp 0.40.2 has
     it, the imp keeps egress `none`, and nixie knows which imp each connection came from.
   - Trade-off: every tool call passes through impd, and a sleep ends the forward. The
     [transport spike](../../../spikes/tools-reverse-forward/README.md) measures about 0.6 to 0.7 ms
     of added median HTTP time and confirms streaming, isolation and reopening after wake. The
     sandbox adapter must implement the reopen lifecycle; a port-level allow entry stays the
     fallback.
2. **The first connector.** The scope asks for one connector in tier 1.
   - Options: Google through its APIs, with Gmail, Calendar and Drive on one owner-registered
     client; generic IMAP and SMTP with an app password; or Microsoft Graph.
   - Recommendation: Google through its APIs, with `gmail.modify`, `calendar.events` and
     `drive.file`. The spike showed an unverified client holding Gmail's restricted scope, and the
     APIs return typed JSON for headers, labels and events.
   - Trade-off: the owner sets up a Google Cloud project with a home page and a privacy policy URL,
     and the day-8 refresh is still pending. IMAP needs no project, and grants the whole mailbox
     with a password that Google advises against.
3. **The OAuth redirect.** Setup needs a route for the authorization code back to nixie.
   - Options: a web client that redirects to the client's own HTTPS origin; or a desktop client with
     a loopback redirect, whose URL the owner pastes into the client.
   - Recommendation: the web client where the client has an HTTPS origin, with the paste as the
     fallback that every connector supports. Setup then takes one click on the usual deployment.
   - Trade-off: whether Google and Microsoft accept a tailnet hostname as a redirect URI is
     unverified, and [open items](../open-items.md#spikes-to-run) lists the check. Supporting both
     costs one more page in the client.
4. **The MCP library.** nixie serves its tools over MCP and, with the proxy, acts as an MCP client.
   - Options: the v1 package `@modelcontextprotocol/sdk`, which implements revisions up to
     2025-11-25 and is what the Agent SDK depends on; or the v2 packages, which implement 2026-07-28
     and fall back to older servers in `auto` mode.
   - Recommendation: the v2 packages for nixie's own code: the tool endpoint, and the proxy's client
     in `auto` mode. In the [MCP proxy spike](../../../spikes/mcp-proxy-pin/README.md), the v2
     client reached both a 2026-07-28 server and a 2025-11-25 server, and checked structured results
     by default. In the [tools endpoint spike](../../../spikes/tools-endpoint/README.md), Claude
     Code 2.1.293 agreed 2026-07-28 with a v2 endpoint, and the model saw the same tools and results
     as with v1.
   - Trade-off: the SDK keeps its own v1 package for the in-process route, so the codebase carries
     both lines, and the v2 line moves fast. On 2026-07-28, a relay that buffers the subscription
     stream stalls every run start, so the relay must stream.
5. **A container sandbox adapter.** [0016](../../decisions/0016-own-interfaces.md) allows one, with
   a weaker boundary than a microVM.
   - Options: build imp only, and keep the interface open; or build a container adapter in the first
     build as well.
   - Recommendation: imp only. A container adapter needs its own injecting proxy for the model
     credential, because containers have no broker, and only an owner without KVM needs it.
   - Trade-off: an owner whose host cannot run imp, such as a VPS without nested virtualisation,
     cannot run nixie until the container adapter exists.
6. **The code runtimes.** The code tool runs code for general work, such as processing a file or
   crunching data, under [0022](../../decisions/0022-coding-and-code-execution.md). The code image
   and the worker image carry the same runtimes, because a worker runs its code in its own imp.
   - Options: Bun only; Bun and Python 3 with a fixed set of data libraries, such as pandas; or a
     general image with package installs at run time.
   - Recommendation: Bun and Python 3 with a fixed set of data libraries. Models write data work in
     Python most readily, and a code imp has no egress, so it cannot install a package at run time.
   - Trade-off: larger images to build and keep current, and a larger worker image reads more from a
     cold disk at start, which the warm page cache from
     [0026](../../decisions/0026-where-workers-and-the-conversation-run.md) offsets. A library
     outside the set is unavailable until the owner adds it to the images.
