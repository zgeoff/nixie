# 0003: Where the Agent SDK runs

- Date: 2026-10-07
- Status: decided
- Research: [placement spike](../../spikes/sdk-placement/)

Every model loop runs in an imp, under [0026](./0026-where-workers-and-the-conversation-run.md), and
nixie's tools run on the host. The SDK holds only nixie's tools for assistant work. `tools: []`
removes every built-in tool from the conversation and from workers, and nixie's tools reach the
model through nixie's MCP endpoint on the host. Running code is one of nixie's tools. Coding
sessions on the built-in coding adapter keep Claude Code's built-in tools inside their imp, under
[0022](./0022-coding-and-code-execution.md). The route from an imp to nixie's tools is set by
[0030](./0030-connectors-and-sandbox-environments.md).

## Why

With only nixie's tools, every action the model takes passes through nixie's policy decision point.
In the spike, the model finished a multi-step task with 3 nixie tools, and used `run_code` when
asked for built-in tools.

Coding work needs file editing, a shell and the rest of Claude Code's toolset, which nixie would
otherwise rebuild. Inside an imp, the spike's tool calls reached the host, every other route failed,
and the broker kept your token out of the sandbox.

## Alternatives

- **Built-in tools for all work.** Actions would bypass nixie's tools and its policy.
- **No built-in tools for coding either.** nixie would rebuild the file and shell tools that coding
  needs.

## Consequences

- Every SDK process sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Without it, Claude Code sent
  evaluation and telemetry calls to Anthropic with your token, and tried to reach Datadog.
- A run stops when `init.mcp_servers` shows nixie's tools as unconnected. In the spike, a failed MCP
  server still ended the run as `success`, and the model invented a tool's output.
- nixie passes a neutral working directory, because the system prompt carries the working directory
  even with every built-in tool off.
- In an imp, nixie passes the broker's proxy and CA variables to the SDK by name.
