# 0003: Where the Agent SDK runs

- Date: 2026-10-07
- Status: decided, amended by [0022](./0022-coding-and-code-execution.md) and
  [0026](./0026-where-workers-and-the-conversation-run.md) and
  [0030](./0030-connectors-and-sandbox-environments.md)
- Research: [placement spike](../../spikes/sdk-placement/),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#open-questions)

nixie runs the Agent SDK in one of 2 places, by the kind of work:

- **Assistant work runs on the host, with only nixie's tools.** `tools: []` removes every built-in
  tool, and nixie's tools run in nixie's own process through an in-process MCP server. Running code
  is one of nixie's tools, and it runs the code inside an imp.
- **Coding sessions on nixie's built-in coding adapter run inside an imp,** under
  [0022](./0022-coding-and-code-execution.md). The model keeps Claude Code's built-in tools inside
  the sandbox, and reaches nixie's tools on the host over HTTP MCP.

## Why

On the host with only nixie's tools, every action the model takes passes through nixie's policy
decision point, and the SDK process has no tool of its own. In the spike, the model finished a
multi-step task with 3 nixie tools and used `run_code` when asked for built-in tools.

Coding work needs file editing, a shell and the rest of Claude Code's toolset, which nixie would
otherwise rebuild. Inside an imp, the spike's tool calls reached the host, every other route failed,
and the broker kept the owner's token out of the sandbox.

## Alternatives

- **Every task on the host.** nixie would rebuild the file and shell tools that coding work needs.
- **Every task inside an imp.** Assistant work would carry the proxy plumbing and the endpoint on
  the host without needing Claude Code's built-in tools.

## Consequences

- Both placements set `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Without it, Claude Code sent
  evaluation and telemetry calls to Anthropic with the owner's token, and tried to reach Datadog.
- Both placements stop a run when `init.mcp_servers` shows nixie's tools as unconnected. In the
  spike, a failed MCP server still ended the run as `success`, and the model invented a tool's
  output.
- On the host, nixie passes a neutral working directory, because the system prompt carries the
  host's working directory even with every built-in tool off.
- In imp 0.38.1, an allow entry admits a whole address, so the spike's imp reached imp's management
  API on the host. [0030](./0030-connectors-and-sandbox-environments.md) settles the route as a
  reverse forward over vsock, with egress `none`; a port-level allow entry or a dedicated address
  remains an alternative only if a later deployment cannot use that route.
- In an imp, nixie passes the broker's proxy and CA variables to the SDK by name, and puts its own
  endpoint on `NO_PROXY`.
- How nixie starts a coding session stays open: its own imp session, or a tool such as atc.
