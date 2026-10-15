# 0003: Where the Agent SDK runs

- Date: 2026-10-07
- Updated: 2026-10-15
- Status: decided
- Design: [sandbox adapter](../design/platform/connectors/sandbox-adapter.md),
  [deployment](../design/platform/deployment/deployment.md)
- Research: [placement spike](../design/platform/spikes/sdk-placement/),
  [imp worker spike](../design/platform/spikes/imp-worker-start/)

Every model loop runs in an imp, and nixie's tools run on the host. The SDK holds only nixie's tools
for assistant work. `tools: []` removes every built-in tool from the conversation and from workers,
and nixie's tools reach the model through nixie's MCP endpoint on the host. Running code is one of
nixie's tools. Coding sessions on the built-in coding adapter keep Claude Code's built-in tools
inside their imp, under [0022](0022-coding-and-code-execution.md). The route from an imp to nixie's
tools is set by [0030](0030-connectors-and-sandbox-environments.md).

## Workers and the conversation

Each worker run gets its own imp, and the whole worker runs inside it: the model loop through the
Agent SDK and any code it runs. nixie creates, wakes and destroys the imp through the sandbox
adapter from [0016](0016-own-interfaces.md). The worker reaches everything outside the model API
through nixie's tools on the host.

The conversation runs in a long-lived imp of its own, which stays awake. It may sleep once imp keeps
the guest's page cache across sleep, a candidate imp change.

The one credential grant a worker or conversation imp holds is the broker's model-API credential,
limited to the model API's host, under [0007](0007-grants-and-taint.md). The guest sees only a
placeholder.

## Why

- With only nixie's tools, every action the model takes passes through nixie's policy decision
  point. In the spike, the model finished a multi-step task with 3 nixie tools, and used `run_code`
  when asked for built-in tools.
- Coding work needs file editing, a shell and the rest of Claude Code's toolset, which nixie would
  otherwise rebuild. Inside an imp, the spike's tool calls reached the host, every other route
  failed, and the broker kept your token out of the sandbox.
- Anything that runs a model loop over untrusted content gets a sandbox. Workers read outside
  content, and the conversation is always untrusted under [0005](0005-effects-and-taint.md), so both
  run in an imp, behind a microVM boundary as well as behind nixie's policy.
- A warm imp costs nothing a person notices. In the spike, a turn in a warm imp reached its first
  text in about 0.8 s, as fast as the same turn on the host.
- A new worker is affordable: creating an imp took 472 ms and a fresh worker reached first text in
  about 2.5 to 3 s, most of it cold disk reads that purpose-built images address.
- The broker keeps the model credential out of the guest, which held only a placeholder in the
  spike.
- An awake conversation imp avoids a cold read on your next message.

## Alternatives

- **Built-in tools for all work.** Actions would bypass nixie's tools and its policy.
- **No built-in tools for coding either.** nixie would rebuild the file and shell tools that coding
  needs.
- **Assistant work on the host, with only its code in an imp.** It needs no route from the imp back
  to nixie's tools. It leaves the model process that reads untrusted content outside the sandbox,
  for the conversation and for workers alike. Policy still covers every action.
- **No model credential in any imp.** The model loop would have to run on the host, outside the
  sandbox.
- **A sleeping conversation imp.** It frees host memory between messages, and each wake adds about
  363 ms plus the cold reads that the page cache would save.

## Consequences

- Every SDK process sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Without it, Claude Code sent
  evaluation and telemetry calls to Anthropic with your token, and tried to reach Datadog.
- A run stops when `init.mcp_servers` shows nixie's tools as unconnected. In the spike, a failed MCP
  server still ended the run as `success`, and the model invented a tool's output.
- nixie passes a neutral working directory, because the system prompt carries the working directory
  even with every built-in tool off.
- In an imp, nixie passes the broker's proxy and CA variables to the SDK by name.
- nixie builds a purpose-built imp image per kind of work. The conversation image holds a minimal
  base, Bun, and the SDK with only the Claude Code build it needs. The worker image adds the code
  environment from 0030.
- The conversation imp holds host memory for the deployment's life.
- 2 candidate imp changes would cut start-up further: a warm template taken after a warm-up turn,
  with entropy and identity reseeded on restore, and a page cache kept across sleep for long-lived
  imps.

## Changes

- 2026-10-09: every model loop runs in an imp, with the model API's credential as its one grant. The
  first version ran assistant work on the host with an in-process MCP server, and put only code runs
  and coding sessions in an imp.
- 2026-10-15: record 0026, Where workers and the conversation run, merged into this record.
