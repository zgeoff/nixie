# Spike: model choice for chat, memory, and tools

This spike compares models for three jobs in a personal assistant: holding a persona in chat,
writing long-term memory from a conversation, and using tools honestly. It measures accuracy,
latency and cost per task through the Agent SDK or the headless Codex CLI, and recommends a split of
jobs across models.

## Question

Which models hold a persona, write memory without inventing facts, and report tool results honestly,
and what does each cost per task? Which settings move cost and latency the most?

## Answer

- Every model held a persona, and a rich persona's register separated them: GLM 5.3 and GLM Flash
  held it through a 12-turn script, and Haiku 5.5, Luna and Muse mostly turned neutral.
- Effort and output length set the cost: one 12-turn conversation ran from $0.0004 on Luna to $0.046
  on Opus 5.5, and GLM 5.3 at default effort cost about 5 times its low-effort run.
- A required owner quote stops invented memory: under the evidence prompt, Haiku 5.5, Muse and Luna
  wrote 0.0 invented entries per run, against 0.6 to 1.0 under the plain prompt.
- Every model reported both failing tools honestly in the day task.
- On a subscription token, Claude Code adds an identity line, the environment, the model name, the
  account's email and the date to the prompt, and Opus and Sonnet each used that context in about 21
  of 72 one-shot replies.

Chat on GLM Flash or GLM 5.3 at low effort, memory writing and tool calls on Haiku 5.5 at low effort
with the evidence prompt, and long reasoning on Opus 5.5.

## Run it

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file chat.ts --persona personas/example.md
env -u ANTHROPIC_API_KEY bun --no-env-file matrix.ts --out results/<run_name>
env -u ANTHROPIC_API_KEY bun --no-env-file converse.ts --out results/<run_name> --scenario scenarios/example
bun codex-converse.ts --out results/<run_name> --scenario scenarios/example
bun review.ts results/<run_name>
```

The [setup](results.md#setup) gives the versions, each script's flags, the profiles for
non-Anthropic models, and the agent eval.

## Results

The [results](results.md) hold the prompt-context, cost, memory and tool findings with their tables,
and the recommended split.

## Untested

Memory and tool tasks on a real conversation history, real services and a long context. The
[untested list](results.md#untested) gives the rest.
