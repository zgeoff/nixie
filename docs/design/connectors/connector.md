# Connectors

- Decisions: [0016](../../decisions/0016-own-interfaces.md),
  [0019](../../decisions/0019-connector-authorization.md),
  [0030](../../decisions/0030-connectors-and-sandbox-environments.md),
  [0014](../../decisions/0014-search.md)

A connector is nixie's code for one outside service, such as Gmail or a search API. It gives nixie
typed tools with declared effects, the polls a trigger source runs, the authorization the service
needs, and the setup steps you follow. A connection is one connector with one of your accounts and
its credential, so 2 Gmail accounts are 2 connections of one connector. You register your own OAuth
client with each provider, and nixie ships none.

## The interface

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
  reconcile?: Reconcile;
  run(call: ActionCall<Input>, context: ConnectorContext): Promise<ActionResponse<Output>>;
}

type Reconcile =
  | { kind: 'idempotency_key'; where: string; keptFor: string }
  | { kind: 'check'; action: string; settleAfter: string }
  | { kind: 'none' };

type ActionResponse<Output> =
  | { kind: 'done'; result: Output }
  | { kind: 'refused'; reason: string } // no effect
  | { kind: 'retry'; reason: string; after?: string } // no effect, may clear
  | { kind: 'ambiguous'; reason: string }; // the action may have happened
```

Each action becomes one of nixie's [tools](./tools.md), with an argument that names the connection
when more than one exists. A tool's effects never depend on its arguments, so a capability with
different effects splits into actions, such as trashing an email and sending one. The
[policy design](../policy/decision-point.md) owns each tool's declaration.

The connector maps each provider response to one of the 4 responses, and the
[action queue](../core/actions.md) turns them into outcomes. Each queued action declares how the
queue reconciles an unknown outcome: the provider's idempotency key and how long the provider keeps
it, a read-only check and how long to wait before trusting a negative answer, or neither. `run`
passes the action ID as the idempotency key, or writes it where the check finds it, such as a header
on a sent email.

`ConnectorContext` gives the connector a [fetcher](./credentials.md) for the connection's
credential, limited to the hosts the connector declares, and nothing else that reaches the network.
Connectors are nixie code in workspace packages, never MCP servers. **Why:** your tokens never leave
nixie's process, and each connector's effects and reconciliation are reviewed code, not a server's
claims.

## Setting up a connection

The client renders each connector's setup steps, which the connector declares as data:

1. **Register a client.** You create an OAuth client in the provider's console, with nixie's
   redirect URI, and paste its ID and secret into the client. nixie stores them as an `oauth_client`
   credential.
2. **Consent.** nixie opens the provider's consent page with PKCE, the scopes of the actions you
   switched on, and a `state` value bound to the device session. The provider sends your browser
   back to nixie's HTTPS origin, and the host exchanges the code for tokens.
3. **Check.** nixie runs the connector's `check`, which makes one read call per scope and records
   the scopes the provider granted.
4. **Switch on.** The connection's tools join the registry, and its polls start.

A provider may grant fewer scopes than nixie asked for, because Google shows each scope as its own
checkbox. nixie leaves out every action whose scope is missing and posts a notice that names them.
**Why:** a tool that fails on every call reads to the model as a broken service, while a missing
tool reads as a missing capability.

Consent returns automatically to nixie's HTTPS address through a Web application OAuth client with
an exactly registered callback URL. The expected deployment serves HTTPS on a fixed name. A static
credential, such as an app password or an API key, skips the first 2 steps.

## Google

The first connector covers Gmail, Google Calendar and Google Drive on one OAuth client you register,
with the scopes `gmail.modify`, `calendar.events` and `drive.file`. The
[Google spike](../../../spikes/google-oauth/README.md) has the setup steps and the consent results.
The app is published to production, because testing status expires consent after 7 days.

- `drive.file` covers files nixie creates and files you select for it, not your whole Drive.
- `gmail.modify` reads, labels, archives, trashes and sends mail, and cannot delete a message for
  good. The connector offers no mail delete action. **Why:** a purge needs the full mail scope,
  which also grants IMAP access, and the trash keeps a message restorable for 30 days.
- The Gmail poll uses the history ID as its cursor. Each sent message carries the action ID in a
  header, so a check after an unknown outcome searches the Sent folder for it.

If a production client's token does not outlive 7 days, mail falls back to IMAP with an app
password, and Calendar and Drive keep OAuth, because Google's CalDAV refuses passwords.

## Search

Search is one of nixie's own tools, on Kagi first. The search tool is a connector whose actions call
a provider adapter, so another provider can sit behind the same tool.

The tool declares the `fetch` effect and returns full results, 10 hits by default and up to 25.
Every field is outside content, and only `publishedAt` is an endorsed type, because a URL can carry
text in its path. The tool writes each search's cost on the call's record, so the live view shows
what search costs. The Kagi API key is a static credential from the deployment.

## Web fetch

Web fetch is one of nixie's own tools: it fetches one public HTTPS page for the model and returns
its text. It runs in nixie's process on the host and declares only the `fetch` effect, so it runs
`direct`. It declares no destination, as the
[destination limits](../policy/decision-point.md#destination-limits) set for the first build.

The tool calls the page through a plain HTTP client, never through the [fetcher](./credentials.md),
so a request carries no credential, cookie or stored header. The tool drops any user name or
password in the URL.

The tool refuses any URL that could reach a non-public address, in these stages:

1. It accepts `https` only, and refuses every other scheme, `http` included.
2. It resolves the host, checks every A and AAAA address returned, and refuses the URL when any
   address is not public.
3. It connects to the address it checked, and sends the host name for TLS and in the `Host` header,
   so a second DNS answer never changes where the request goes.
4. It runs the first 3 stages again on every redirect.

A non-public address is one of these:

- loopback, the private ranges, and the unspecified, multicast and broadcast addresses
- link-local, which holds cloud metadata services at `169.254.169.254`
- the shared address space `100.64.0.0/10`, which holds Tailscale addresses
- IPv6 unique local and link-local addresses, and the IPv4-mapped IPv6 form of any address above

**Why:** the tool runs on the host, so a URL that names one of these addresses reaches nixie's own
services, impd, a cluster's pod and service ranges, or a device on your tailnet.

Each call has 3 limits, all configurable: a body of 2 MB, 15 s for the whole call with its
redirects, and 5 redirects. The tool stops reading at the body limit and marks the result as
truncated.

The result holds the final URL, the status code, the content type, the page's text and the truncated
mark. An HTML page returns its readable text, another text type returns as it arrived, and a binary
type returns no body. Every field is outside content. The status code and the truncated mark are
endorsed types, and the URL and the text never are.
