# Spike: a turn past the context window with auto-compaction off

This spike drives turns past the context window with the SDK's auto-compaction off, so that nixie's
compactor knows how to detect an overflow inside a turn. The SDK ends such a turn with a result
whose `terminal_reason` is `blocking_limit` when the CLI refuses the next call itself, or
`prompt_too_long` when the model API refuses it. No other failure in the spike gives either value,
so the guest can detect an overflow on that field alone. A fork at the last committed boundary drops
the failed turn, and a turn run again on a session that opens from a summary completes. The
[compactor design](../../core/session-opening.md#the-compactor) relies on these answers.

| Component        | Version                                |
| ---------------- | -------------------------------------- |
| Claude Agent SDK | 0.3.290, the version the repo pins     |
| Claude Code      | 2.1.290, from the SDK's native package |
| Bun              | 1.4.2                                  |
| Model            | `claude-haiku-5-5`                     |

## Questions

1. What does the guest see when a turn passes the window with `autoCompactEnabled: false`?
2. Can the guest tell it apart from other failures reliably?
3. Can nixie compact from the last committed boundary and run the turn again?

## Setup

[`overflow.ts`](overflow.ts) runs each turn with
`settings: { autoCompactEnabled: false, autoCompactWindow: 100_000 }`, as nixie's guest passes them,
plus `tools: []`, `settingSources: []` and a short system prompt. Every prompt is invented filler:
numbered lines about a harbour's tide gauge, which the script generates at a set size. An in-process
MCP tool, `read_page`, returns one page of the same filler with a code word at its end, so each tool
call grows the context by a known step. The script takes a scenario:

- `blocking` lowers the CLI's limit to 24,000 tokens with its test variable
  `CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE`, a small window that keeps each model call cheap.
- `real` runs the same turns with no override, on the window the CLI assumes for the model.
- `api` raises the CLI's limit past the model's window and sends one prompt of about 1,050,000
  tokens, so the model API refuses it.
- `others` runs 5 failures that are no overflow, for contrast.

`blocking` and `real` run the same 4 steps. Turn 1 sends a block of filler and commits. Turn 2 forks
at turn 1's last message and reads pages 1 to 4 until the context passes the window. A compaction
call forks at turn 1's last message again and asks for a summary with no tools. Turn 2 then runs
again on a new session whose first message holds the summary.

## Run it

Run the commands from this directory. Inside a sandbox whose broker adds the model credential, set
`CLAUDE_CODE_OAUTH_TOKEN` to any placeholder instead of the vault read. `real` costs about $1.60 in
the SDK's estimate, `blocking` about $0.25, and the others under $0.05.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file overflow.ts blocking "$(mktemp -d)"
```

## What the guest sees

An overflow ends the turn with 2 messages and then a throw, whichever side refuses:

1. An assistant message with `error: "invalid_request"`, one text block `Prompt is too long`, and no
   usage. The CLI writes it to the session's transcript.
2. A result with `subtype: "success"`, `is_error: true`, `result: "Prompt is too long"`,
   `stop_reason: "stop_sequence"`, and a `terminal_reason` that names the side that refused.
3. The `query()` iterator then throws
   `Error: Claude Code returned an error result: Prompt is too long`.

The SDK neither compacts nor retries. No `compact_boundary` message arrives, because the CLI's
reactive compaction runs only when auto-compaction is on.

The CLI refuses first in most cases. It assumes a window of 200,000 tokens for `claude-haiku-5-5`,
and its result reports that window as `contextWindow`. The Models API gives the same model a
`max_input_tokens` of 1,000,000, and `claude-sonnet-5-5` the same. With auto-compaction off, the CLI
ignores `autoCompactWindow` and refuses a call whose estimated context reaches its assumed window
less 23,000 tokens: a 20,000-token output reserve and a 3,000-token margin, read from the CLI's
bundled source. The `real` scenario fits that rule. Turn 2 passed nixie's 100,000-token
`autoCompactWindow` without a stop, made a call that read 169,138 tokens, and was refused the next
call at about 185,000.

The CLI's check missed one case. A first prompt of 208,798 tokens, with the limit as shipped, went
to the model API, which answered it. The current script leaves that run out because it cost $0.84.

```text
--- turn 2: read pages past the window                  (real)
assistant error=- context=153040 text="" tools=mcp__pages__read_page({"page":2})
assistant error=- context=169138 text="" tools=mcp__pages__read_page({"page":3})
assistant error=invalid_request context=0 text="Prompt is too long" tools=-
result {"subtype":"success","is_error":true,"terminal_reason":"blocking_limit","stop_reason":"stop_sequence","num_turns":4,"result":"Prompt is too long"}
thrown: Error: Claude Code returned an error result: Prompt is too long

--- one prompt past the model window, CLI limit raised  (api)
assistant error=invalid_request context=0 text="Prompt is too long" tools=-
result {"subtype":"success","is_error":true,"terminal_reason":"prompt_too_long","stop_reason":"stop_sequence","num_turns":1,"result":"Prompt is too long"}
```

## Telling it apart

Only an overflow gives `blocking_limit` or `prompt_too_long` as the result's `terminal_reason`. The
other failures in the spike end differently:

| Case                     | Assistant `error`   | Result `subtype`  | `terminal_reason` |
| ------------------------ | ------------------- | ----------------- | ----------------- |
| CLI refuses the overflow | `invalid_request`   | `success`         | `blocking_limit`  |
| API refuses the overflow | `invalid_request`   | `success`         | `prompt_too_long` |
| A model that is not real | `model_not_found`   | `success`         | `api_error`       |
| A 400 for a bad option   | `unknown`           | `success`         | `api_error`       |
| The output cap reached   | `max_output_tokens` | `success`         | `api_error`       |
| `maxTurns` reached       | none                | `error_max_turns` | `max_turns`       |
| An abort                 | none                | no result         | no result         |

`subtype` and `is_error` group the overflow with every API error, so neither alone is enough. The
text `Prompt is too long` is the CLI's own string for both overflows, but a string match breaks when
the CLI rewords it. `terminal_reason` is a closed union in the SDK's types, so it is the field to
detect on.

## Compact and run again

The failed turn stays in the transcript: in `blocking`, 11 messages after it, with its tool calls,
its tool results and the `Prompt is too long` message. A fork with `resumeSessionAt` at turn 1's
last message drops all of it. The compaction call on that fork read 14,624 tokens in `blocking` and
136,387 in `real`, about turn 1's own context, and wrote its summary. Turn 2 then ran again on a new
session that opened from the summary, read all 4 pages, and answered `EMBER`, the code word on
page 4. Its last call read 18,942 tokens in `blocking` and 65,874 in `real`.

## Recommendation

Keep the one compact-and-retry, and detect the overflow on the result's `terminal_reason`:

- The guest reads the result before the iterator throws, and reports an overflow as its own outcome
  when `terminal_reason` is `blocking_limit` or `prompt_too_long`. The guest's ended frame carries
  `is_error` but no terminal reason, so the host cannot tell an overflow from an API error.
- The guest moves its boundary to the CLI's error message too, so a failed turn's boundary includes
  the turn. The retry forks at the last committed boundary, never at the failed turn's.
- The CLI refuses at its assumed window less 23,000 tokens and ignores the profile's context cap
  once auto-compaction is off. nixie's threshold is the only check below that, so the profile's
  window has to sit at or under the CLI's assumed window.

## Untested

- An API refusal in the middle of a turn. The CLI's assumed window sits below the model's, so the
  CLI refuses first, and the spike sent only one prompt past the model's window.
- `claude-sonnet-5-5`, the default model, and a model name with `[1m]`, which changes the window the
  CLI assumes.
- A turn that alone exceeds the window. Its retry should overflow again.
- Why the CLI's check let the 208,798-token first prompt through.
