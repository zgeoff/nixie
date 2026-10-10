# 0030: Connectors and sandbox environments

- Date: 2026-10-09
- Status: decided
- Extended: 2026-10-10, credential disconnect and forget
- Amends: [0003](./0003-sdk-placement.md), [0016](./0016-own-interfaces.md),
  [0019](./0019-connector-authorization.md), [0022](./0022-coding-and-code-execution.md),
  [0026](./0026-where-workers-and-the-conversation-run.md)
- Design: [connectors](../design/connectors/connector.md), [tools](../design/connectors/tools.md),
  [sandbox adapter](../design/connectors/sandbox-adapter.md),
  [coding](../design/connectors/coding.md), [credentials](../design/connectors/credentials.md)

The owner agreed the connector and sandbox choices below. nixie's host application remains
Bun/TypeScript. The code environment is what an agent runs programs in for general work; a coding
agent adapter manages its own session and toolchain.

## The route to nixie's tools

An imp reaches nixie's tools through a reverse forward from its loopback, over the guest agent's
vsock connection. It keeps egress `none`. nixie binds the connection to its imp and run, relays to
that run's MCP endpoint and checks its bearer token. The sandbox adapter reopens the forward after
wake; it never substitutes an address-wide network allow entry.

The [transport spike](../../spikes/tools-reverse-forward/README.md) completes an SDK tool call, uses
the v2 subscription stream, blocks the paired management-port control under egress `none`, and
reopens after sleep and wake. Its preserved 100-request samples measure about 0.6 ms of added median
HTTP time on the local host, including the CLI's local TCP relay hop.

## Google first

Google APIs are the first connector, with `gmail.modify`, `calendar.events` and `drive.file`, on one
owner-registered OAuth client. Google is the service the owner uses, and its project is set up. The
[Google spike](../../spikes/google-oauth/README.md) obtains those scopes from an unverified
production client and calls Gmail, Calendar and Drive on day 0.

`drive.file` covers files nixie creates and files the owner explicitly selects; it is not access to
the whole Drive. `gmail.modify` supports mail organisation and sending without immediate permanent
deletion. The connector does not add a full-mailbox purge scope.

## Automatic HTTPS consent return

The normal setup flow opens Google consent and automatically returns the owner's browser to nixie's
HTTPS origin. It uses a Web application OAuth client in the owner's project, with the callback URL
registered exactly. The host exchanges the code; device-session-bound `state` and PKCE bind it to
the setup attempt. The expected deployment already supplies HTTPS on a fixed name.

The spike's Desktop client and working localhost callback remain evidence for that spike. A
failed-localhost URL copied into nixie is not an agreed fallback and is not promised for every
provider.

## MCP v2

Nixie's tool endpoint and outside-server proxy use the v2 TypeScript MCP packages. The proxy sets
its client to automatic protocol negotiation. The
[proxy spike](../../spikes/mcp-proxy-pin/README.md) reaches both protocol revisions it tests, and
[the endpoint spike](../../spikes/tools-endpoint/README.md) confirms that Claude Code calls the v2
endpoint and receives the structured results.

The Agent SDK keeps its own v1 dependency and its v1 in-process helper for tests. That does not make
the production endpoint v1 or change the one set of tool definitions. The proxy validates results
against its pinned schema, regardless of the client's latest-listing validator.

## Imp implementation, container sketch

The first build implements imp only. A container adapter is sketched to test whether the shared
interface assumes a microVM; its implementation is deferred. The
[sketch](../design/connectors/sandbox-adapter.md#a-container-adapter-sketch) maps lifecycle, files,
bounded tool and proxy sockets, host credential injection, egress enforcement and resource limits.
It exposes memory-preserving sleep as a capability. A backend without that capability cannot call
pause or stop "sleep".

The first conversation stays awake and workers are disposable under
[0026](./0026-where-workers-and-the-conversation-run.md), so the first design does not need a
container checkpoint implementation. Nixie's recovery lists and destroys orphaned sandboxes through
their recorded owning adapter. Imp is the initial backend, not the core's identifier format.

## A familiar code environment

The code and worker images supply Node.js, Python and a familiar Linux command-line environment,
including jq, ripgrep (`rg`) and grep, with a shell and common file and text tools. Node.js is an
actual runtime; Bun remains available where nixie's model harness needs it. The aim is an
environment that agents can use through ordinary programs and commands, not a minimal pair of
interpreters.

The deployment builds and pins the runtime, tool and library inventory into its images. The model
can inspect what is installed. An image update changes that inventory; adding a tool does not grant
network egress or credentials. The existing sandbox and policy rules continue to apply. The choice
does not replace nixie's host language or limit a coding adapter's toolchain.

## Credential disconnect and forget

The client uses Disconnect for a credential supplied by a read-only deployment or external manager.
Disconnect durably disables its binding, blocks future use and grants, revokes nixie's grants and
removes nixie-owned copies. Restart and source refresh cannot silently reconnect it. Reconnect needs
an explicit checked action. The original secret remains at its source; nixie neither deletes nor
revokes that external credential. Disconnect cannot retract a request that a provider already
received.

The client retains Forget for credentials that nixie stores in its database. Forget deletes their
encryption keys under the existing forget-completion contract. The client distinguishes local
disconnection from erasure of a database-owned value. The deployment retains control of its external
secrets under 0016 and 0020.

## Alternatives and trade-offs

- A port-level allow entry needs an imp change; a dedicated host address depends on other services'
  bind settings. The reverse forward exists and needs its relay and reopen lifecycle.
- IMAP/SMTP starts with mail only; Microsoft Graph targets another provider. Google uses the owner's
  existing service and project, with the OAuth setup that entails.
- Localhost consent needs the browser to reach the callback listener. The web return fits the client
  deployment and needs a separate Web application client from the spike's Desktop client.
- MCP v1 aligns with the SDK's internal dependency. V2 supports the current protocol and passes the
  integrations, while the dependency tree carries both lines.
- A built container adapter supports hosts without KVM and adds another network, injection and
  lifecycle implementation. A sketch checks the interface without shipping that backend.
- Bun-only code images have fewer dependencies. Node.js, Python and common tools match familiar
  agent workflows and add packages to maintain and measure.

- Requiring a source change first leaves the external source as the only control, but delays
  stop-use from nixie. Disconnect adds a durable local override that the client must show clearly.

## Remaining validation

The choices are settled; their validation is not complete. The Google token refresh after 7 days
remains due on or after 2026-10-16. The actual private-network HTTPS callback needs registration and
a consent check with a new Web application client. The final code and worker images need inventory,
representative-program, size and cold-start checks. These remain in
[open items](../design/open-items.md#spikes-to-run); this record does not claim a deployment or a
built code environment.
