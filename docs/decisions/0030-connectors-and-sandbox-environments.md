# 0030: Connectors and sandbox environments

- Date: 2026-10-09
- Status: decided
- Design: [connector](../design/connectors/connector.md), [tools](../design/connectors/tools.md),
  [sandbox adapter](../design/connectors/sandbox-adapter.md),
  [credentials](../design/connectors/credentials.md)
- Research: [reverse forward spike](../../spikes/tools-reverse-forward/),
  [Google OAuth spike](../../spikes/google-oauth/), [proxy spike](../../spikes/mcp-proxy-pin/),
  [endpoint spike](../../spikes/tools-endpoint/)

nixie's connectors and sandboxes settle these choices. nixie's host application is Bun and
TypeScript.

## The route to nixie's tools

An imp reaches nixie's tools through a reverse forward from its loopback, over the guest agent's
vsock connection, with egress `none`. nixie binds each connection to its imp and task run, relays it
to that task run's MCP endpoint and checks its bearer token. The sandbox adapter reopens the forward
after wake, and never substitutes an address-wide network allow entry. In the spike, the relay added
about 0.6 ms to the median HTTP round trip, and tool calls, streaming and reopening after sleep all
passed.

## Google first

Google APIs are the first connector, with `gmail.modify`, `calendar.events` and `drive.file`, on one
OAuth client registered by the deployment under [0019](./0019-connector-authorization.md).
`drive.file` covers files nixie creates and files you select, not the whole Drive. `gmail.modify`
covers organising and sending mail without permanent deletion, and the connector adds no purge
scope.

## Automatic HTTPS consent return

Setup opens Google's consent page and returns your browser to nixie's HTTPS origin. It uses a Web
application OAuth client with the callback URL registered exactly. The host exchanges the code, and
`state` bound to the device session plus PKCE bind it to the setup attempt. No pasted-URL fallback
is promised.

## MCP v2

nixie's tool endpoint and its external-server proxy use the v2 TypeScript MCP packages, and the
proxy negotiates the protocol revision with each server. The Agent SDK keeps its own v1 dependency,
which does not change the one set of tool definitions.

## imp first, with a container sketch

The first build implements the imp sandbox adapter only. A container adapter is sketched to check
that the shared interface does not assume a microVM, and the sketch made memory-preserving sleep an
optional capability. Recovery lists and destroys orphaned sandboxes through the adapter that owns
them.

## A familiar code environment

The code and worker images supply Node.js, Python and a familiar Linux command line, including a
shell, jq, ripgrep, grep and common file and text tools. The deployment builds and pins the
inventory into its images, and the model can inspect what is installed. Adding a tool grants no
egress or credentials. A coding adapter manages its own toolchain.

## Disconnect and forget for credentials

A credential that a deployment or an external secret manager supplies gets Disconnect. Disconnect
durably disables its binding, revokes nixie's grants and removes nixie's own copies, and a restart
or a source refresh cannot reconnect it. Reconnecting takes an explicit checked action. The original
secret stays at its source, untouched, and a request a provider already received stays sent. A
credential that nixie stores in its own database gets Forget, which deletes its encryption keys
under the forget contract from [0010](./0010-memory-store.md).

## Why

- The reverse forward exists in imp and keeps the sandbox off the host network entirely.
- Google is the service already in use, with its project set up and its scopes proven by the spike.
- An automatic return fits a client served over HTTPS on a fixed name.
- MCP v2 supports the current protocol, and the spikes reached both protocol revisions through it.
- A container sketch checks the interface without shipping a second backend.
- Agents work best in a familiar environment of ordinary programs and commands.
- Disconnect gives nixie an immediate stop without reaching into secrets that the deployment owns.

## Alternatives

- **A port-level allow entry, or a dedicated host address.** The first needs an imp change, and the
  second depends on other services' bind settings.
- **IMAP and SMTP, or Microsoft Graph, first.** IMAP covers mail only, and Graph targets another
  provider.
- **Localhost consent.** It needs the browser to reach a callback listener on the host.
- **MCP v1,** which the SDK uses internally. It lags the current protocol.
- **A built container adapter.** It supports hosts without KVM, and adds another network, injection
  and lifecycle implementation.
- **Bun-only code images.** They have fewer dependencies, and fewer of the tools agents expect.
- **Change the source first.** It leaves the external source as the only control, and delays a stop
  from nixie.

## Consequences

- The Google refresh after 7 days, the HTTPS callback on a private network, and the code and worker
  images' inventory, size and cold start are open items.
