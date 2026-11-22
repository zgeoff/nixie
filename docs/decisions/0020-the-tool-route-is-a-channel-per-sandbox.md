# 0020: A sandbox reaches the tools over a channel bound to it

- Date: 2026-11-22
- Status: decided

## Decision

Every sandbox adapter gives each sandbox one channel to nixie's tool endpoint, bound to that
sandbox, and gives the sandbox no network route to the host. A sandbox adapter is code that runs
sandboxes behind nixie's `Sandbox` interface on one runtime, such as the reference adapter on imp.
nixie reads which sandbox a tool call came from off the channel the call arrives on. It ignores any
name the program in the sandbox gives itself.
[Sandboxes](../architecture/connectors/sandboxes.md#the-tool-route) covers the channel the reference
adapter opens.

## Why

- nixie runs each tool call under the owner of the sandbox the channel belongs to, such as a
  conversation or a task run. A program in one sandbox can therefore never call a tool as another
  sandbox's owner.
- A runtime that opens a network route to the host can admit more than the tool endpoint. imp's
  egress allow entry admits a whole address, so an imp allowed to reach the tool endpoint would also
  reach the API of impd, the daemon that runs every imp.

## Rejected alternatives

| Option                                       | Why not                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| a network route from the sandbox to the host | Other services on the host's address are reachable, and nixie must take the owner from the sandbox. |

## Consequences

- An adapter for a runtime with no per-sandbox channel builds one before it can run the kinds of
  work that call tools, such as the conversation and workers.
