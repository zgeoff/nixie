# Spike results: what the Codex CLI sends the model

This spike records each model request that the Codex CLI sends on a nixie task turn, and gives each
byte of its body a source. With the guest's config and catalog, the model reads nixie's prompt,
nixie's tools and 488 bytes of Codex tool text, about 119 tokens, and no Codex system prompt. Each
fact below ends with its source: [measured] for a fact this spike ran and saw, [read in the code]
for a fact read in the Codex source or in this repo, and [from a record] for a fact an earlier spike
or doc holds.

## Setup

| Component    | Version                                                          |
| ------------ | ---------------------------------------------------------------- |
| Codex CLI    | `codex-cli 0.166.0`, the guest's pin; `run.ts` refuses any other |
| Codex source | the `rust-v0.166.0` tag; every path below is under `codex-rs/`   |
| Bun          | 1.4.3                                                            |
| Tokenizer    | `o200k_base`, from `gpt-tokenizer` 4.1.2                         |
| Model name   | `gpt-6-luna`, reasoning effort `low`                             |

[`run.ts`](run.ts) runs one task turn through `runCodexGuest`, the production guest, so the CLI
reads the `config.toml` and `model-catalog.json` that the guest writes. A variant may change either
file after the guest writes it and before the CLI starts. The turn's system prompt comes from
`renderPrompt('task', …)`, and its tools from the production builders of a started task's default
tools, with the silent end and the report that every task gets, in
[`build-task-tools.ts`](build-task-tools.ts). [`start-tool-server.ts`](start-tool-server.ts) lists
those tools over Streamable HTTP MCP as the step's tool route does.

[`start-stub-upstream.ts`](start-stub-upstream.ts) stands in for the model API and for the ChatGPT
backend. It keeps each request's body, its size in bytes as sent, and its headers with each
credential's value removed. It answers a model request with a short streamed reply. Every other host
goes through [`start-refusing-proxy.ts`](start-refusing-proxy.ts), which notes the host and
answers 403. The files in [`runs/final/`](runs/final/) hold each variant's config, catalog and
requests, with the state folder's path and the host's operating system replaced by placeholders.
[`report.ts`](report.ts) writes [`runs/final/report.md`](runs/final/report.md), the table of every
part of every model request.

### Tokens

The stub has no tokenizer of the model, so each token count is an `o200k_base` count of the part's
text, or of its JSON for a tool or an input item that is not a message. No count here is checked
against the model API's own count. The closest pair: `o200k_base` counts 2,654 tokens for the
bundled catalog's request [measured], and the model API counted 2,767 input tokens for the
codex-app-server spike's first call [from a record]. That call sent a different prompt and tool, and
most likely the same bundled entry, since that spike wrote no catalog.

## The variants

| Variant                      | What changes                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `before`                     | the guest as it was before this spike: no `[analytics]` or `[feedback]` table, and no `model_messages` in the catalog |
| `before-plan-backend`        | `before`, on a plan login, with `chatgpt_base_url` at the stub                                                        |
| `production`                 | nothing: the guest's config and catalog, with an API key                                                              |
| `production-plan`            | `production`, on a plan login, with the ChatGPT backend left at `chatgpt.com`                                         |
| `production-plan-backend`    | `production`, on a plan login, with `chatgpt_base_url` at the stub                                                    |
| `attribution-plan-backend`   | `production-plan-backend`, with a user settings answer that turns commit attribution on                               |
| `attribution-closed-backend` | `attribution-plan-backend`, with `chatgpt_base_url` at a closed loopback port in place of the stub                    |
| `tool-call`                  | `production`, with a first reply that calls `time.now`, so a second request follows                                   |
| `bundled-catalog`            | `production`, without `model_catalog_json`, so the CLI uses its bundled entry                                         |
| `capture-tag`                | `production`, with a turn-input capture tag in the base URL's path                                                    |

Every variant ended its turn with `finished` [measured].

## The first request, part by part

The `production` variant's request body is 8,127 bytes as sent [measured]:

| Part                                | Source   | Bytes | Tokens |
| ----------------------------------- | -------- | ----- | ------ |
| `input[0]` developer text           | nixie    | 903   | 198    |
| `input[1]` user text                | nixie    | 43    | 10     |
| tool `list_mcp_resources`           | Codex    | 126   | 29     |
| tool `list_mcp_resource_templates`  | Codex    | 135   | 30     |
| tool `read_mcp_resource`            | Codex    | 125   | 29     |
| tool `mcp__nixie` namespace         | Codex    | 102   | 31     |
| tool `mcp__nixie.task_message`      | nixie    | 1,530 | 355    |
| tool `mcp__nixie.task_report`       | nixie    | 579   | 129    |
| tool `mcp__nixie.tasks_list`        | nixie    | 1,623 | 363    |
| tool `mcp__nixie.time_now`          | nixie    | 664   | 148    |
| tool `mcp__nixie.turn_end_silently` | nixie    | 445   | 101    |
| `client_metadata`, as sent          | metadata | 1,310 | -      |
| 8 other fields                      | metadata | 133   | -      |
| braces, commas and keys             | JSON     | 409   | -      |

- The body holds no `instructions` field and no Codex developer message [measured].
- The developer text is nixie's task prompt, byte for byte, and the user text is the turn's message
  [measured]. The guest passes the prompt as `baseInstructions` on `thread/start`
  (`guests/codex/src/turn/run-codex-turn.ts:207`), and the CLI sends base instructions as the first
  developer message (`core/src/client.rs:1073`) [read in the code]. So nixie's prompt takes the
  place of Codex's own base instructions, in this variant and in `bundled-catalog` alike [measured].
- Codex rewrites each nixie tool's schema before it sends it [measured]. It renames `time.now` to
  `time_now`, adds `"strict": false`, sorts the properties, and gives an empty object
  `"properties": {}`. It drops each keyword its schema type has no field for, such as `minimum`,
  `maximum`, `minLength` and `maxLength` (`tools/src/json_schema.rs:37`,
  `tools/src/json_schema/types.rs:40`) [read in the code]. The model never sees those limits, and
  nixie's tool route still checks them. The descriptions arrive byte for byte [measured].
- The 8 other fields are `model`, `stream`, `tool_choice`, `parallel_tool_calls`, `reasoning`,
  `store`, `include` and `prompt_cache_key`. They set how the API answers, and the model reads none
  of them as text [read in the code].
- `client_metadata` holds IDs, the sandbox mode, the workspace path and `analytics_enabled`. The
  same text goes in the `x-codex-turn-metadata` header [measured]. Whether the upstream shows it to
  the model is unknown, so this report counts it as metadata.
- A plan login's body has the same fields, input and tools as an API key's. It differs in the IDs in
  `prompt_cache_key` and `client_metadata`, and in the state folder's path, whose length differs by
  variant name [measured].

## Before and after

The guest change in this spike's PR adds an `[analytics]` and a `[feedback]` table and
`memories = false` to `config.toml`, and an empty description and empty schema for each MCP resource
helper to the catalog [read in the code]. The `before` variants leave out the tables and the catalog
change, and keep `memories = false`, which changes nothing in the request.

| Variant                      | Body bytes | Codex bytes the model reads | Codex tokens | nixie bytes | nixie tokens |
| ---------------------------- | ---------- | --------------------------- | ------------ | ----------- | ------------ |
| `bundled-catalog`            | 12,267     | 9,448                       | 2,446        | 946         | 208          |
| `before`                     | 9,607      | 1,973                       | 400          | 5,787       | 1,304        |
| `production`                 | 8,127      | 488                         | 119          | 5,787       | 1,304        |
| `production-plan`            | 8,132      | 488                         | 119          | 5,787       | 1,304        |
| `attribution-plan-backend`   | 9,394      | 1,613                       | 354          | 5,787       | 1,304        |
| `attribution-closed-backend` | 8,143      | 488                         | 119          | 5,787       | 1,304        |
| `tool-call`, request 2       | 8,505      | 524                         | 131          | 5,850       | 1,328        |

[measured]

- The catalog change cut 1,485 bytes and about 281 tokens of Codex text from every model request,
  and nixie's part stayed the same [measured].
- In `bundled-catalog`, the 9,448 bytes are one `additional_tools` item: a script tool named `exec`
  whose description holds Codex's guidance and a declaration of each nixie tool. nixie's tools reach
  the model only inside that script tool, which is why nixie's own count drops to the 2 messages
  [measured].
- `tool-call` request 2 adds the model's own call, 106 bytes, and the tool result. Codex puts a
  36-byte header, such as `Wall time: 0.0072 seconds\nOutput:`, before the tool server's content
  [measured].
- On a plan login, `before-plan-backend` sent a `POST /backend-api/codex/analytics-events/events` to
  the ChatGPT backend, and `production-plan-backend` sent none. `analytics_enabled` went from `true`
  to `false` in the turn metadata [measured].

### Beside the Claude Code capture

The [model-eval](../model-eval/results.md#each-harness-adds-context-to-the-prompt) spike lists what
Claude Code adds to a request in a table of yes and no. The same table for the Codex CLI, from this
spike's variants [measured]:

| Setup                                   | Base instructions | Developer message | Script tool guidance | Resource helper text | Analytics upload |
| --------------------------------------- | ----------------- | ----------------- | -------------------- | -------------------- | ---------------- |
| Bundled catalog, API key                | no                | no                | yes                  | no                   | no               |
| Guest before this spike, plan login     | no                | no                | no                   | yes                  | yes              |
| Guest, API key or plan login            | no                | no                | no                   | no                   | no               |
| Guest, plan account with attribution on | no                | yes               | no                   | no                   | no               |

"Base instructions" means Codex's own, in place of nixie's prompt. In the bundled catalog, the
script tool's single item holds every tool, so the 3 helpers have no text of their own. The
model-eval spike's 2,300 input tokens for Codex came from a run that kept the code-mode host on
[from a record], so that run most likely sent the same script tool. This spike did not check it.

## What each setting removes

| Codex adds                               | Setting that removes it                                                                                                      | Where in the Codex source                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Codex's own base instructions            | nixie's prompt as `baseInstructions` on `thread/start`, already set                                                          | `core/src/client.rs:1073`                                                                                               |
| the 3 MCP resource helpers' text         | catalog `model_messages.tools.mcp_resources`, each with `description: ""` and a schema with no properties; set by this spike | `protocol/src/openai_models.rs:624` and `:727`, `:646` for an empty description; `tools/src/catalog_tool_message.rs:16` |
| the analytics upload on a plan login     | `[analytics] enabled = false`; set by this spike                                                                             | `config/src/types.rs:250`, `core/src/session/session.rs:1691`                                                           |
| feedback uploads                         | `[feedback] enabled = false`; set by this spike                                                                              | `config/src/types.rs:258`                                                                                               |
| the bundled script tool and its guidance | nixie's own catalog entry, already set                                                                                       | measured in `bundled-catalog`                                                                                           |
| history notes                            | a provider other than `openai`, already set                                                                                  | `ext/history-notes/src/extension.rs:50`, `model-provider-info/src/lib.rs:697`                                           |
| memories                                 | `[features] memories = false`; off by default, and set by this spike so a new default cannot turn it on                      | `features/src/lib.rs:1367`, `ext/memories/src/extension.rs:48`                                                          |

The guest's earlier settings, such as the `include_*` keys and the disabled features, left nothing
in the request body that this spike could find [measured].

### Feedback

No variant sent a feedback upload, before or after [measured]. The app server uploads feedback only
when its client asks for it (`app-server/src/request_processors/feedback_processor.rs:59`), and the
guest never asks. The table also stops Guardian review retention
(`core/src/guardian/feedback.rs:18`), which the guest's disabled `guardian_approval` feature already
keeps off [read in the code]. The table changes nothing in the request, and keeps a later CLI from
uploading on its own.

## What cannot be removed

- **The 3 MCP resource helpers.** Codex adds `list_mcp_resources`, `list_mcp_resource_templates` and
  `read_mcp_resource` whenever any MCP server is configured (`core/src/tools/spec_plan.rs:1277`),
  and nixie's tools reach the CLI only as an MCP server. With empty text, the 3 still cost 386
  bytes, about 88 tokens [measured]. No setting drops them [read in the code].
- **The namespace line.** `Tools in the mcp__nixie namespace.` comes from
  `tools/src/responses_api.rs:65`, used when the server sends no instructions
  (`core/src/tools/spec_plan.rs:1156`). An MCP server that sends `instructions` replaces it with its
  own text (`codex-mcp/src/rmcp_client.rs:1046`) [read in the code]. An empty string falls back to
  the same line. Replacing it with nixie's own words is a wording choice, which this spike leaves
  alone.
- **The wall-time header on each tool result.** `core/src/tools/context.rs:233` puts
  `Wall time: <seconds> seconds\nOutput:` before every MCP tool result, with no setting [read in the
  code]. It costs about 12 tokens a call [measured].

## A ChatGPT plan login

### Commit attribution

On a plan login, Codex asks the ChatGPT backend for the user settings
(`ext/git-attribution/src/policy.rs:70`), and the app server installs that check on every thread
(`app-server/src/extensions.rs:101`) [read in the code]. When the answer has
`commit_attribution_enabled: true`, Codex adds a `<git_attribution>` developer message that tells
the model to sign commits and pull requests as Codex (`ext/git-attribution/src/world_state.rs:18`).
In `attribution-plan-backend` it cost 1,125 bytes, about 235 tokens [measured].

No setting names it. Any answer other than a success leaves it out
(`ext/git-attribution/src/policy.rs:87`) [read in the code], as the stub's 404 in
`production-plan-backend` showed [measured]. In production, the broker refuses every ChatGPT path
that Codex calls other than the step's own route
([the model gateway](../../docs/architecture/policy/model-gateway.md#the-path-of-a-plan-request))
[from a record], so the settings request fails and the message stays out. The capture below checks
that.

The guest could also keep it out without the broker: in `attribution-closed-backend`,
`chatgpt_base_url` at a closed loopback port left the message out, and the CLI sent no request but
the model request [measured]. The model request does not use `chatgpt_base_url`, because the
provider's `base_url` names its route. The guest does not set it; whether to set it is a choice for
the owner, since it hides every ChatGPT backend call, wanted or not.

### Workspace check

On a plan login, Codex also sends `GET /backend-api/wham/accounts/check`, from the app server's
workspace routing (`app-server/src/request_processors/account_processor/workspace_routing.rs:411`)
[measured, read in the code]. It adds nothing to the model request. The broker refuses it in
production [from a record].

### What the stub cannot see

The stub sees what the CLI sends, and nothing that happens after it. For a plan request, it cannot
see:

- what the ChatGPT backend adds between the gateway and the model, such as its own instructions;
- what the plan account's settings answer, and so whether the attribution message appears when the
  broker lets the request through;
- the input tokens the upstream counts for the request.

One production plan request read about 14,300 input tokens, a figure this spike did not check. A
first task turn here counts about 1,423 tokens with the guest's settings. The gap is unexplained:
the stub's turn has a short prompt and 5 tools, and this spike does not know the production
request's prompt, tools or history.

### A proposed capture of one plan request

The [turn-input log](../../docs/architecture/policy/turn-input-log.md) already copies each model
request at the gateway, after the broker and before the upstream. A capture of one task step on a
plan profile settles each item above:

1. Turn the log on for one hour with `nixie turn-input on --for 1h`, on a deployment whose
   `turn_input_log` lists the plan gateway as a source.
2. Start one task on the plan profile, with the default tools.
3. Open the captured body, and run its parts through `report.ts`'s table by hand.
4. Compare the upstream's input tokens on the step's usage with the body's `o200k_base` count.

Expect: no `<git_attribution>` message, the 488 bytes of Codex tool text, and an upstream count
close to the body's count. A larger upstream count measures what the backend adds. This spike did
not run the capture.

## Untested

- The real model API's answer to a tool with an empty description and a schema with no properties.
  The CLI parsed both, and the stub accepts any body.
- A real plan request, and what the ChatGPT backend adds to it.
- A compaction request, and any turn after the first of a task.
- A conversation turn, whose prompt and tools differ from a task's.
- The model's own tokenizer.
