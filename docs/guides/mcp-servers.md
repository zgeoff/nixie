# Connect an MCP server

Add an outside MCP server to nixie's config, register nixie as a client on the server, and sign in
from Settings → MCP servers. The model can then call the server's tools, and each call goes through
your rules. nixie reaches the server through its
[MCP proxy](../architecture/connectors/mcp-proxy.md), and keeps the server's tokens sealed in its
credential store. Each tool takes the name `<server_id>.<tool>`.

Settings → MCP servers lists each server with its state, its sign-in, its health and its tools.

## Before you start

- An MCP server that serves Streamable HTTP over `https://`, and signs clients in with the MCP
  standard's OAuth: the authorization code grant with PKCE. The server must also add the `iss`
  parameter, set to its issuer, to the sign-in return, as RFC 9207 describes. nixie ends a sign-in
  whose return has no `iss` or a different one. nixie offers no client secret and does not register
  itself on the server.
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
```

- `tracker` is the server ID. It matches `^[a-z][a-z0-9]{1,15}$` and prefixes every tool name.
- `url` is the server's MCP address. It has no user name, query or fragment.
- `clientID` is the ID from the previous section.
- `scope` lists the scopes to ask for, separated by spaces.
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
tools the server lists appear on its card as available. The assistant can call them on its next
turn.

When the server stops accepting its refresh token, the card shows "Needs sign-in" and a Sign in
again button. Select it and sign in again.

## Let a tool's calls run

You approve no tool. Each tool the server lists is available at its first listing, and each call of
a tool goes through the same rules as a call of nixie's own tool:

- A tool that only reads, by its annotations or by an
  [override file](../architecture/connectors/mcp-proxy-declarations.md#override-files), runs with no
  question.
- Any other tool asks you before each call, unless a rule allows it.

To let the calls of a server run, add a rule whose `tools` holds `<server_id>.*`, such as
`tracker.*`. The rule allows every tool of that server, including the tools the server lists later,
so allow only the scopes you gave the server. The deny, always-ask, destination and scope checks
still run for each call. To allow one tool, name it: `tracker.item_create`.

Each tool declares its effects by its annotations, and an annotation is the server's own claim. The
starter rule `allow-reads` runs any tool that declares only reads with no question, so a tool that
claims `readOnlyHint` runs unasked. For a server you don't trust to describe its tools, write an
override file for each of its tools in the definitions repo, and add no rule that allows the server.

A task or job definition lists a server's tools in its `tools`: `<server_id>.*` for all of them, or
`<server_id>.<tool>` for one. The run holds them, and a tool the server lists later too.

## When a tool changes

- A change that keeps the shape of the tool's input, such as a new description or new annotations,
  applies at once, and the assistant and you get a notice. `nixie mcp notices` lists them.
- A change that widens what the tool accepts, such as a new property, a removed limit or a wider
  type, stops the tool. Settings → MCP servers shows "Stopped" beside it and the link "Accept the
  change". Open the card, read both forms, and select Accept the change.

Expect: after you accept, the tool shows as Available again in its new form.

nixie refuses a listing of more than 200 tools, a tool schema over 64 KiB, or a name that appears
twice. The server then shows as unreachable until its next listing passes.

## When a server is unreachable

After 3 failed listings in a row, the card shows "Unreachable" with the last error and the time of
the next try. nixie tries again on its own. A server whose sign-in lapsed does not count as
unreachable: it shows "Needs sign-in".
