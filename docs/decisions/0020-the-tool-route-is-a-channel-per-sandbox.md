# 0020: A sandbox reaches the tools over a channel bound to it

- Date: 2026-11-22
- Status: decided

## Decision

A program in a [sandbox](../architecture/connectors/sandboxes.md) calls nixie's tools over one
connection that the sandbox adapter opens for that sandbox alone, and the sandbox has no network
route to the host. A sandbox adapter runs sandboxes on one runtime behind nixie's `Sandbox`
interface, and every adapter must give each sandbox that calls tools such a connection. nixie learns
which sandbox a tool call came from by the connection it arrives on, and ignores any name the
program in the sandbox claims.
[The tool route](../architecture/connectors/sandboxes.md#the-tool-route) covers the connection that
the reference adapter, on imp, opens.

## Why

- nixie runs each tool call as the conversation or task run that the sandbox belongs to. A program
  in one sandbox therefore never calls a tool as another conversation or task run.
- A network route opens more of the host than the tool endpoint. imp, the microVM runtime of the
  reference adapter, lets a guest reach an outside address only through a firewall rule that opens
  the whole address. A rule that let an imp reach the tool endpoint would also let it reach impd,
  the daemon that runs every imp.

## Rejected alternatives

| Option                                       | Why not                                                               |
| -------------------------------------------- | --------------------------------------------------------------------- |
| a network route from the sandbox to the host | It opens other services on the host's address.                        |
| the program in the sandbox names its caller  | Any program in a sandbox could name another conversation or task run. |

## Consequences

- An adapter for a runtime that cannot open a connection for one sandbox alone cannot run a kind of
  sandbox that calls tools, such as the conversation's or a worker's, until it builds one.
