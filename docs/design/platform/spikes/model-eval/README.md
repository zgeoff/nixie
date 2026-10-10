# Spike: model choice for chat, memory, and tools

This spike compares models for three jobs in a personal assistant: holding a persona in chat,
writing long-term memory from a conversation, and using tools honestly. It measures accuracy,
latency, and cost per task, and it recommends a split of jobs across models. Every model runs under
the same persona and prompts through one of two harnesses: the Agent SDK, or the headless Codex CLI.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.292, which runs its bundled Claude Code 2.1.292
- Codex CLI: 0.160.0
- Models: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-haiku-4-5-20251001`,
  `claude-fable-5-1`, `glm-5.3`, `glm-5.3-flash`, `muse-spark-1.3-contributor`, and `gpt-6-luna`

## Question

Which models hold a persona, write memory without inventing facts, and report tool results honestly,
and what does each cost per task? Which settings move cost and latency the most?

## Run it

Run each command from this directory. The Anthropic models read the OAuth token from the vault.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file chat.ts --persona personas/example.md
env -u ANTHROPIC_API_KEY bun --no-env-file matrix.ts --out results/<run_name>
env -u ANTHROPIC_API_KEY bun --no-env-file converse.ts --out results/<run_name> --scenario scenarios/example
bun codex-converse.ts --out results/<run_name> --scenario scenarios/example
bun review.ts results/<run_name>
```

Git ignores `results/`, `transcripts/`, and `profiles.local.json`.

### Chat, one-shot matrix, and conversations

- `chat.ts` is a streaming terminal chat with a persona file as the system prompt. `--mode replace`
  sends the persona as the whole system prompt, and `--mode append` adds it to the Claude Code
  preset. At the `you>` prompt, `/restart`, `/persona <file>`, `/mode`, and `/model <id>` start a
  new session.
- `matrix.ts` sends each prompt in [prompts.md](prompts.md) once to each model under each persona in
  [personas/](personas/). It appends one JSON line per reply and skips cells the output already
  holds, so a stopped run continues where it ended.
- `converse.ts` runs a multi-turn script in one session. A scenario folder holds `persona.md` and
  `script.md`, with one `##` section per owner turn. `--samples <n>` runs the scenario `n` times,
  and `--effort <level>` sets the reasoning effort.
- `codex-converse.ts` runs the same scenario through `codex exec`, resuming one Codex thread per
  sample.
- `review.ts` turns a run's `results.jsonl` into `review.html`, a side-by-side page with one section
  per prompt or turn and one column per model.

### Non-Anthropic models

A profile in `profiles.local.json` points the bundled Claude Code at an endpoint that speaks the
Anthropic Messages format. Copy [profiles.example.json](profiles.example.json) and fill in the base
URL, the model, and a key or a command that prints it. The harness runs the key command once per
process and keeps the key in memory. A profile run sets `CLAUDE_CODE_SIMPLE=1` and goes through
[proxy.ts](proxy.ts), which drops the billing header and the Claude Code identity line, so the
endpoint receives only the persona and the owner's messages. Anthropic does not support non-Claude
models behind `ANTHROPIC_BASE_URL`.

### Agent eval

The agent eval in [agent/](agent/) runs two tasks against a mock tool server,
[agent/mock-tools.ts](agent/mock-tools.ts). The mock server speaks MCP over stdio, keeps its state
in `MOCK_DIR`, and logs every call. `MOCK_FAIL` makes chosen calls fail:
`calendar_create:1,calendar_create:2` fails the first two calls to that tool.

```bash
env -u ANTHROPIC_API_KEY bun --no-env-file agent/run.ts --out results/<run_name> --samples 2
env -u ANTHROPIC_API_KEY bun --no-env-file agent/judge.ts results/<run_name>
bun agent/report.ts results/<run_name>
```

- **Memory task:** the model reads a transcript and updates the owner's memory through
  `memory_search`, `memory_write`, and `memory_update`, then lists open loops. A memory case folder
  holds `seed.json` (memory before), `gold.md` (the ground truth for the judge), and
  `transcripts/*.md`. `--memory-case <dir>` picks the folder, and
  [agent/memory/example](agent/memory/example/) is the default. Each transcript runs under the three
  prompts in [agent/memory](agent/memory/): plain, strict, and evidence.
- **Day task:** the model works through [agent/day/script.md](agent/day/script.md) with every mock
  tool available. Two tools fail on purpose, and each failure persists across one retry.
- **Judge:** an Opus judge labels every memory entry as supported, inferred, invented, or
  misattributed, and checks each day turn for claims the tool results do not support. Code checks
  each evidence quote against the owner's lines.

`run.ts` holds the model configs. Haiku, GLM, and Muse run through the Agent SDK with `mcpServers`,
`strictMcpConfig: true`, and the mock tools in `allowedTools`. Luna runs through Codex with the mock
server in the generated config.

## Answer

### Each harness adds context to the prompt

A request capture of a subscription run shows what Claude Code sends besides the persona:

- The system prompt starts with a billing header block and the line "You are a Claude agent, built
  on Anthropic's Claude Agent SDK." The persona comes after both.
- The first user message holds `<system-reminder>` blocks with the working directory, the OS, the
  model name and ID, the account's email address, and the date.

Opus and Sonnet used this context in about 21 of 72 one-shot replies each. They signed emails with
the account holder's name, dated "this Saturday", and offered shell commands.

| Setup                                    | Identity line | Environment | Model name | Email | Date |
| ---------------------------------------- | ------------- | ----------- | ---------- | ----- | ---- |
| Subscription token                       | yes           | yes         | yes        | yes   | yes  |
| Gateway token                            | yes           | yes         | yes        | no    | yes  |
| Gateway token and `CLAUDE_CODE_SIMPLE=1` | yes           | no          | no         | no    | no   |

`CLAUDE_CODE_SIMPLE=1` turns off subscription login, so a subscription run cannot use it.
`CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`, `CLAUDE_CODE_TOTAL_TOKENS_REMINDER`, and an empty
`CLAUDE_CODE_USER_EMAIL` change none of the blocks.

Codex reaches a near-clean prompt with its own `CODEX_HOME` and `HOME` per conversation and the
config that `codex-converse.ts` writes. `model_instructions_file` replaces the base instructions
with the persona. The `include_*` switches, `project_doc_max_bytes = 0`,
`[skills] include_instructions = false`, `[skills.bundled] enabled = false`,
`[agents] enabled = false`, and the feature switches remove every developer message. The model then
receives the persona, the owner's message, and 3 tool definitions, about 2,300 input tokens. Codex
calls MCP tools through its code-mode host, so a run with tools keeps `code_mode_host` on and sets
`default_tools_approval_mode = "approve"` on the mock server.

### Every model holds a persona, and prompt detail decides the register

All 7 models in the one-shot matrix stayed in character under 7 distinct-voice personas and a
neutral control, and all of them did the task. Under every persona, every model gave the same
emergency advice to a medical-emergency prompt. A rich persona with a default register and
situational rules separates the models: GLM 5.3 and GLM Flash held the default register through a
12-turn script, and Haiku 5.5, Luna, and Muse mostly replaced it with a neutral tone. A sample
exchange in the persona did not change Haiku 5.5. The personas, prompts, and scripts behind these
findings are not in the repo; [personas/example.md](personas/example.md), [prompts.md](prompts.md),
and [scenarios/example](scenarios/example/) hold neutral examples.

Without tools, GLM claimed to set a reminder in 6 of 8 replies and Muse in 7 of 8. Sonnet, Opus,
Haiku 4.5, Haiku 5.5, and Fable claimed it in 0 of 8. In a conversation recap, Fable and GLM stated
events the owner never reported. One persona line saying the conversation is a real person's real
day stopped this for Fable and reduced it for GLM. Every model assumed a gender for the owner when
the profile gave none.

### Effort and output length set the cost

Prices are per million tokens. The conversation cost is for one 12-turn conversation with prompt
caching, from measured output tokens and estimated input tokens. Times are the median and 90th
percentile per turn through the harness.

| Model and effort      | Input | Cached input | Output | Cost per conversation | Median turn | 90th percentile |
| --------------------- | ----- | ------------ | ------ | --------------------- | ----------- | --------------- |
| Haiku 5.5, low        | $0.10 | $0.01        | $0.50  | $0.0016               | 1.7 s       | 4 s             |
| GPT-6 Luna, low       | $0.10 | $0.01        | $0.50  | $0.0004               | 5.1 s       | 5.8 s           |
| GLM Flash, low        | $0.15 | $0.03        | $0.50  | $0.001                | 5.9 s       | 41 s            |
| Muse Contributor, low | $0.10 | $0.002       | $0.20  | $0.001                | 15.2 s      | 21.1 s          |
| GLM 5.3, low          | $1.40 | $0.26        | $4.40  | $0.008                | 4.0 s       | 5.8 s           |
| GLM 5.3, default      | $1.40 | $0.26        | $4.40  | $0.043                | 12.8 s      | 29.7 s          |
| Opus 5.5, default     | $4    | $0.20        | $20    | $0.046                | 3.5 s       | 5.4 s           |

- Thinking tokens count as output. GLM 5.3 at default effort writes about 8 times the output tokens
  of GLM 5.3 at low effort for the same replies, and Muse at low effort spends about 90% of its
  output on thinking.
- Haiku 5.5 charges 5 times every rate for a prompt over 100,000 tokens.
- Muse waits on the server before the first token. Direct API calls at `minimal` effort took a
  median of 24 s on the Contributor tier and 8.4 s on the Standard tier, with single calls up to 54
  s. The thinking token count did not predict the wait.
- GLM Flash returned `429 Rate limit reached` on 7 of 76 runs with 8 runs in parallel, and the
  retries before each 429 inflate its 90th percentile.

The GLM and Opus prices come from the providers' pricing pages. The Muse and Luna prices come from
third-party listings, because the providers' pages require a login.

### A required owner quote stops invented memory

Each cell is 12 runs: 6 transcripts and 2 samples. Three transcripts contain events the assistant
invented, to test whether the writer stores them as facts. The invented columns count invented
entries per run.

| Model and effort      | Plain prompt | Strict prompt | Evidence prompt | Outdated entry updated | Time per run | Cost per run |
| --------------------- | ------------ | ------------- | --------------- | ---------------------- | ------------ | ------------ |
| Haiku 5.5, low        | 1.0          | 0.1           | 0.0             | 56%                    | 11 s         | $0.0015      |
| Muse Contributor, low | 0.8          | 0.0           | 0.0             | 81%                    | 30 s         | $0.0009      |
| GPT-6 Luna, low       | 0.6          | 0.0           | 0.0             | 6%                     | 11 s         | $0.0008      |
| GLM Flash, low        | 2.1          | 1.1           | 1.0             | 69%                    | 57 s         | $0.0015      |
| GLM Flash, default    | 1.8          | 0.3           | 0.5             | 94%                    | 180 s        | $0.004       |
| GLM 5.3, low          | 0.9          | 0.5           | 0.6             | 53%                    | 48 s         | $0.013       |
| GLM 5.3, default      | 1.3          | 0.0           | 0.3             | 83%                    | 76 s         | $0.025       |

- The plain prompt invents for every model. The strict prompt forbids recording the assistant's
  claims and suggestions as facts. The evidence prompt requires an exact owner quote for every
  entry.
- Under the evidence prompt, code found 3 of 228 quotes that did not match the owner's lines, 2 of
  them from GLM Flash.
- Luna adds a new entry instead of updating the outdated one, so its memory holds contradictory
  entries.
- GLM reaches zero invented entries only at default effort with the strict prompt.
- The cost per run assumes about 20,000 input tokens across the tool round trips, three quarters of
  them cached.

### Every model reports tool failures honestly

In the day task, 2 runs per model, every model reported both persisting failures and kept the draft
unsent. GLM 5.3 at default effort made 1 false claim in 2 runs: it dated an event to the wrong day.
Luna showed the draft in its reply instead of saving it with `message_draft`, and it missed the
closed venue in the search results. GLM 5.3 took about 14 s per turn with tools, against 4 s without
them, and Haiku 5.5 took 2.3 s.

### Recommended split

| Job                          | Model                                    | Reason                                                   |
| ---------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Chat                         | GLM Flash at low effort, or GLM 5.3 low  | Holds a rich persona's register; honest with tools       |
| Memory writing               | Haiku 5.5 at low effort, evidence prompt | 0 invented entries, 11 s per run                         |
| Tool calls and small tasks   | Haiku 5.5 at low effort                  | Fastest model; 0 false claims                            |
| Long or background reasoning | Opus 5.5, or Muse Standard               | Strongest reasoning; Muse only where a 30 s wait is fine |

The design follows from the findings:

- The chat model reports only what a tool result says, and a separate model writes memory from the
  transcript with an owner quote for each entry.
- The owner profile holds the owner's name and pronouns.
- Thinking models run at low effort for chat.
- Background jobs plan for provider rate limits.

## Untested

- Memory and tool tasks on a real conversation history, real services, and a long context.
- More than 2 samples per cell for the day task and the conversations.
- A direct API call for the Anthropic models, without Claude Code's injected context.
- Whether `strictMcpConfig: true` keeps the account's claude.ai connectors out of a subscription
  session.
