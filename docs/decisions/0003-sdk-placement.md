# 0003: Every model loop runs in an imp, and assistant work holds only nixie's tools

- Date: 2026-10-07
- Updated: 2026-10-09
- Status: decided

## Decision

Every model loop runs in an imp, and nixie's tools run on the host. No assistant work runs on the
host. The SDK holds only nixie's tools for assistant work: `tools: []` removes every built-in tool
from the conversation and from workers, and nixie's tools reach the model through nixie's MCP
endpoint on the host. Running code is one of nixie's tools.

An imp that runs a model loop holds the model API's credential through the broker, and the guest
sees only a placeholder.

## Why

- With only nixie's tools, every action the model takes passes through nixie's policy decision
  point. In the
  [placement spike](https://github.com/zgeoff/nixie/tree/e232631a587680970a5c8804455415e7f97140bc/docs/design/platform/spikes/sdk-placement/),
  the model finished a multi-step task with 3 nixie tools, and used `run_code` when asked for
  built-in tools.
- Anything that runs a model loop over untrusted content gets a sandbox. Workers read outside
  content, and the conversation is always untrusted under [0005](0005-untrusted-conversation.md), so
  both run in an imp, behind a microVM boundary as well as behind nixie's policy.
- A warm imp costs nothing a person notices. In a spike, a turn in a warm imp reached its first text
  in about 0.8 s, as fast as the same turn on the host.
- A new worker is affordable: in the [imp worker spike](../../research/imp-worker-start/), creating
  an imp took 472 ms and a fresh worker reached first text in about 2.5 to 3 s.
- The broker keeps the model credential out of the guest, which held only a placeholder in the
  spike.

## Rejected alternatives

| Option                                                   | Why not                                                                                                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| built-in tools for all work                              | Actions would bypass nixie's tools and its policy.                                                                                                                                                                |
| assistant work on the host, with only its code in an imp | It needs no route from the imp back to nixie's tools. It leaves the model process that reads untrusted content outside the sandbox, for the conversation and for workers alike. Policy still covers every action. |
| no model credential in any imp                           | The model loop would have to run on the host, outside the sandbox.                                                                                                                                                |

## Changes

- 2026-10-09: every model loop runs in an imp, with the model API's credential as its one grant. The
  first version ran assistant work on the host with an in-process MCP server, and put only code runs
  and coding sessions in an imp.
