# Connect an MCP server

Add an outside MCP server to nixie's config, register nixie as a client on the server, sign in from
Settings → MCP servers, and allow the tools the model may call. nixie reaches the server through its
[MCP proxy](../architecture/connectors/mcp-proxy.md), and keeps the server's tokens sealed in its
credential store. Each tool takes the name `<server_id>.<tool>`.

Settings → MCP servers lists each server with its state, its sign-in, its health and its tools.

## Before you start

- An MCP server that serves Streamable HTTP over `https://`, and signs clients in with the MCP
  standard's OAuth: the authorization code grant with PKCE. nixie offers no client secret and does
  not register itself on the server.
- A web address for nixie that starts with `https://`, such as `https://nixie.example.org`.
- A browser signed in to nixie, open on that address.

## Register nixie on the server

1. On the server's own client registration page, create a client for nixie. Choose a public client.
2. Give your nixie address plus `/connections/google/return` as its redirect URI, such as
   `https://nixie.example.org/connections/google/return`. nixie uses one return route for every
   OAuth sign-in.
3. Give the scopes you want nixie to hold. The grant caps what nixie can do on the server.
4. Copy the client ID the server gives.

## Add the server to the config

Add the server under `mcp.servers` in `config.yaml`, then restart nixie:

```yaml
mcp:
  servers:
    tracker:
      url: https://tracker.example.org/mcp
      clientID: <client_id>
      scope: read write
      trusted: false
```

- `tracker` is the server ID. It matches `^[a-z][a-z0-9]{1,15}$` and prefixes every tool name.
- `url` is the server's MCP address. It has no user name, query or fragment.
- `clientID` is the ID from the previous section.
- `scope` lists the scopes to ask for, separated by spaces.
- `trusted` stays `false` unless you want a changed tool to apply with a notice. A new tool always
  waits for you.
- `privateRange` is a CIDR range. Add it only when the server's host resolves to a private address.

Expect: after the restart, the server shows as Held on Settings → MCP servers, and a proposal waits
among your approvals.

## Approve the server

1. Open Proposals.
2. Read the card for the server. It shows the URL, the client ID, the scopes, the trust and the
   range.
3. Select Add the server.

Expect: the server shows as Added with the sign-in "Not signed in". nixie asks again only when you
change one of these facts in the config to give the server more reach.

## Sign in

1. On Settings → MCP servers, select Connect on the server's card.
2. Sign in on the server's own page and allow the scopes.

Expect: the server sends you back to Settings → MCP servers, the sign-in reads "Signed in", and the
tools the server lists appear on its card as waiting for your approval.

When the server stops accepting its refresh token, the card shows "Needs sign-in" and a Sign in
again button. Select it and sign in again.

## Approve a tool

nixie hides each tool the server lists until you allow it, because the model would otherwise call a
tool you never read.

1. Open Proposals.
2. Read the card for the tool. It shows the whole form of the tool, and the effects the tool runs
   under.
3. Select Allow the tool.

Expect: the tool shows as Allowed on the server's card, and the model can call it. When a server
changes a tool you allowed, nixie stops the tool and writes a new card, unless the server is trusted
and the change adds no input property.

## When a server is unreachable

After 3 failed listings in a row, the card shows "Unreachable" with the last error and the time of
the next try. nixie tries again on its own. A server whose sign-in lapsed does not count as
unreachable: it shows "Needs sign-in".
