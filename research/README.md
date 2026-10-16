# Spikes

A spike is a throwaway experiment that answers one research question for a design. Each folder here
holds one spike as its own Bun package, pinned to the exact versions it ran against. Its README
gives the question, how to run it, the output it produced and what it left untested. The root
workspace installs the spikes, and CI typechecks each one, so a spike that a later design reruns
still compiles. CI runs no spike and no spike test, and product code never imports from a spike.

Spikes that call the model read a token from the repo's `.env`, which git ignores; `.env.example`
lists the variable.

| Spike                                                 | What it answers                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [connector-account-pick](connector-account-pick/)     | whether the model passes the ID of the connector account that a message names                    |
| [encoder](encoder/)                                   | which small local embedding model to ship, by retrieval quality, CPU time, memory and image size |
| [fetch-headless](fetch-headless/)                     | how far headless Chromium, held to the fetch sandbox's limits, gets on challenge-protected pages |
| [forget-backups](forget-backups/)                     | whether a forget reaches the key backups: snapshot removal, pruning, and a restore after forget  |
| [google-oauth](google-oauth/)                         | an unverified client in production, Gmail's restricted scope, and token refresh past 7 days      |
| [imp-worker-start](imp-worker-start/)                 | imp create and wake, and the SDK's first token inside an imp against the host                    |
| [mastra-connect](mastra-connect/)                     | a reading spike on Mastra Connect's connector model, with the ideas worth adapting               |
| [mcp-proxy-pin](mcp-proxy-pin/)                       | hash pinning, effect declarations and output checks on the v2 MCP packages                       |
| [memory-retrieval](memory-retrieval/)                 | keyword search, BM25 and local embeddings over synthetic memory, and where they part             |
| [model-eval](model-eval/)                             | persona, invented memory, tool honesty, cost and latency per model                               |
| [paste-spans](paste-spans/)                           | which spans of a message you pasted, kept right through edits                                    |
| [policy-rules](policy-rules/)                         | one decision per call whatever the rule order, a stable snapshot hash, and prompts by cause      |
| [replica-encryption](replica-encryption/)             | Litestream through a host crypt gateway, process outages, and a restore without the database     |
| [start-session-forwarding](start-session-forwarding/) | a separate Start server that forwards the device session to the API and holds none itself        |
| [tools-reverse-forward](tools-reverse-forward/)       | relay overhead, streamed responses, egress isolation and reopening after wake                    |
| [turn-tokens](turn-tokens/)                           | the tokens of a turn for each model role, and the budget defaults they set                       |
| [voice-latency](voice-latency/)                       | the time from the end of speech to the reply's first audio and to the full answer                |
| [worker-cold-start](worker-cold-start/)               | first text on the worker image with the code runtimes in it, and a fresh fetch sandbox per fetch |

## Agent SDK spikes

The Agent SDK spikes sit beside the platform design, in
[docs/design/platform/spikes](../docs/design/platform/spikes/), as packages outside the workspace.

| Spike                                                              | What it answers                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [sdk-first-token](../docs/design/platform/spikes/sdk-first-token/) | the time from the prompt to the first streamed token, on a live and on a new process |
| [sdk-long-hold](../docs/design/platform/spikes/sdk-long-hold/)     | hook time limits, long holds, and `defer` across processes                           |
| [sdk-mod-policy](../docs/design/platform/spikes/sdk-mod-policy/)   | what a policy mod can enforce, and the 3 ways it fails open                          |
| [sdk-owner-input](../docs/design/platform/spikes/sdk-owner-input/) | when each message priority reaches the model during a task                           |
| [sdk-pinned-core](../docs/design/platform/spikes/sdk-pinned-core/) | when a changed system prompt reaches a resumed session                               |
| [sdk-reasoning](../docs/design/platform/spikes/sdk-reasoning/)     | what nixie receives of the model's reasoning under its options, and its storage cost |
| [sdk-resume-at](../docs/design/platform/spikes/sdk-resume-at/)     | whether `resumeSessionAt` and `forkSession` drop a turn that never committed         |
| [sdk-skills](../docs/design/platform/spikes/sdk-skills/)           | which skills and slash commands reach the model under nixie's options                |
