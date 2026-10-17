# Spike: 1-hour prompt cache entries for the conversation

This spike finds out whether the conversation's Claude Code command-line interface (CLI) can write
1-hour prompt cache entries on an API-key or bearer profile, and what that does to a turn after a
pause. It can: the CLI's `promptCacheTtl` setting, or its `CLAUDE_CODE_PROMPT_CACHE_TTL` variable,
set to `1h` makes every model call of the conversation write 1-hour entries, through any base URL.
Without either, an API-key or bearer profile writes 5-minute entries, so a turn more than 5 minutes
after the last one writes its whole context to the cache again. With 1-hour entries, a turn 400
seconds after the last one read its context from the cache and cost what a warm turn costs. The
1-hour lifetime makes a bursty day cheaper once about 42% of the gaps between bursts fall between 5
and 60 minutes.

## Question

Which CLI setting makes the conversation write 1-hour entries through a base URL other than
Anthropic's, such as the counting proxy, and what does a day of bursty turns cost with each
lifetime? The answer informs the conversation's query options, and whether a model profile needs a
fifth price ([GEO-890](https://linear.app/zgeoff/issue/GEO-890)).

## Versions

| Component        | Version                             |
| ---------------- | ----------------------------------- |
| Claude Agent SDK | 0.3.290, the repo's catalog version |
| Claude Code      | 2.1.290, bundled with the SDK       |
| Bun              | 1.4.2                               |
| Model            | `claude-opus-5-5` at medium effort  |
| nixie            | commit `aaf6be3`                    |

The recorded runs ran against the conversation guest at that commit. The guest's system prompt has
gained a sentence about dropped images, and the harness compiles against the moved renderers, which
changes no cache behaviour this spike measures.

## How the CLI picks a lifetime

The bundled CLI picks the lifetime of each model call from the first of these that applies. The
conversation's calls read the main-conversation variable and setting, because a query made through
the Agent SDK counts as the main conversation:

1. `FORCE_PROMPT_CACHING_5M` set: 5 minutes.
2. `CLAUDE_CODE_PROMPT_CACHE_TTL`, `5m` or `1h`.
3. The `promptCacheTtl` setting, `5m` or `1h`.
4. `ENABLE_PROMPT_CACHING_1H` set: 1 hour.
5. A Claude subscription login within its usage limits: 1 hour.
6. Otherwise 5 minutes.

The subscription case needs the CLI's own OAuth login, which the guest never holds: the guest has a
placeholder API key or bearer token, and the credential grant swaps it on the way out. The token use
spike saw only 5-minute entries for this reason, although a subscription paid for every call. None
of the 6 steps reads the base URL. The CLI counts a custom base URL as Anthropic's own API, so it
sends the extended cache lifetime beta header with a 1-hour request. The subscription case also
turns on the CLI's cache keepalive, which renews entries between turns, and a lifetime set by the
setting or the variable does not.

## Setup

[`run.ts`](run.ts) runs one conversation session of 8 turns through the production guest turn, on
the token use spike's [invented fixtures](../turn-tokens/spike-fixtures.ts) and scripted tool
server. Turn 1 opens with the pinned-memory message that a new session opens with, and each turn's
retrieved memories go before its message in a retrieved-memory system message, as the production
preamble places them. Turns 1 to 6 follow each other at once, the run waits a set pause, then turn 7
runs and turn 8 follows it at once. Each run ends its system prompt with its own random ID, so no
run reads a cache entry that another run wrote.

The production query options at the recorded commit passed neither the setting nor the variable, so
[`register-query-override.ts`](register-query-override.ts) rewrites the guest turn's import of the
Agent SDK to [`override-query.ts`](override-query.ts) when Bun loads it. That module adds the arm's
setting or variable to the options the production builder made, and changes nothing else. The
production query options now pass the profile's cache lifetime as the setting, so the run sets that
lifetime to the arm's setting, or to 5 minutes for an arm without one; a rerun of a default arm
therefore asks for `5m` where the recorded run asked for no lifetime.

[`start-count-proxy.ts`](start-count-proxy.ts) stands in for the counting proxy and the credential
grant. The profile's base URL points at it, and it swaps the guest's placeholder for the signed-in
Claude login's token before it forwards each request. For each model call it records the lifetimes
the request asked for, whether the request carried the extended cache lifetime beta, and the
5-minute and 1-hour cache writes from the response.

The recorded runs used these arms, and the lifetime option is the one each recorded run passed:

| Arm                  | Auth header | Lifetime option                   | Pauses         |
| -------------------- | ----------- | --------------------------------- | -------------- |
| `api-key-default`    | `x-api-key` | none                              | 400 s          |
| `bearer-default`     | bearer      | none                              | 400 s          |
| `api-key-setting-1h` | `x-api-key` | `promptCacheTtl: '1h'`            | 400 s, 3,720 s |
| `bearer-setting-1h`  | bearer      | `promptCacheTtl: '1h'`            | 400 s          |
| `api-key-env-1h`     | `x-api-key` | `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` | none           |

## Run it

Run `bun install` at the repo root, which installs this spike and the token use spike it imports
from, then run each arm from this directory on a host with a signed-in Claude Code login. The proxy
reads the login's access token from the credentials file on every request, so the guest only ever
holds a placeholder.

```bash
export MODEL_TOKEN_FILE=~/.claude/.credentials.json
bun run.ts api-key-default 400
bun run.ts api-key-setting-1h 400
bun run.ts api-key-setting-1h 3720
bun report.ts
```

## Results

Every call in the default arms asked for no lifetime and wrote 5-minute entries. Every call in the
setting and variable arms asked for `1h`, carried the beta header, and wrote 1-hour entries. The API
key and bearer profiles behaved the same. The first turn of each run read about 3,700 tokens: the
nixie tool definitions sit before the system prompt and match in every run, so the run ID leaves
them shared. Cost is at Opus 5.5's list prices, which a subscription makes notional, and the runs
came to $1.19, with about $1.65 more for trial runs, killed runs and an earlier round that left the
pinned memory out, none of them in the table.

[`report.ts`](report.ts) prints this table from the run files in [`runs/`](runs/). The warm row is
the mean of turns 2 to 6 and turn 8.

| Run                      | Turn            | Calls | Input | Write 5m | Write 1h | Cached | Output | Cost    |
| ------------------------ | --------------- | ----- | ----- | -------- | -------- | ------ | ------ | ------- |
| api-key-default-400s     | first turn      | 2.0   | 4     | 2,025    | 0        | 9,315  | 247    | $0.0169 |
| api-key-default-400s     | warm, mean of 6 | 2.2   | 6     | 1,237    | 0        | 21,102 | 431    | $0.0191 |
| api-key-default-400s     | after 400 s     | 2.0   | 6     | 9,244    | 0        | 16,242 | 324    | $0.0560 |
| api-key-env-1h-0s        | first turn      | 2.0   | 4     | 0        | 2,015    | 9,305  | 277    | $0.0235 |
| api-key-env-1h-0s        | warm, mean of 6 | 2.2   | 6     | 0        | 1,223    | 21,418 | 422    | $0.0225 |
| api-key-env-1h-0s        | after 0 s       | 3.0   | 8     | 0        | 1,543    | 37,371 | 692    | $0.0337 |
| api-key-setting-1h-3720s | first turn      | 2.0   | 4     | 0        | 5,685    | 5,541  | 251    | $0.0516 |
| api-key-setting-1h-3720s | warm, mean of 6 | 1.8   | 6     | 0        | 1,138    | 16,967 | 377    | $0.0201 |
| api-key-setting-1h-3720s | after 3720 s    | 2.0   | 6     | 0        | 12,332   | 11,873 | 410    | $0.1093 |
| api-key-setting-1h-400s  | first turn      | 2.0   | 4     | 0        | 2,019    | 9,309  | 247    | $0.0230 |
| api-key-setting-1h-400s  | warm, mean of 6 | 2.2   | 6     | 0        | 1,288    | 21,320 | 438    | $0.0233 |
| api-key-setting-1h-400s  | after 400 s     | 2.0   | 6     | 0        | 709      | 25,415 | 370    | $0.0182 |
| bearer-default-400s      | first turn      | 2.0   | 4     | 2,020    | 0        | 9,310  | 250    | $0.0170 |
| bearer-default-400s      | warm, mean of 6 | 2.0   | 6     | 1,139    | 0        | 18,559 | 378    | $0.0170 |
| bearer-default-400s      | after 400 s     | 2.0   | 6     | 8,444    | 0        | 15,361 | 349    | $0.0523 |
| bearer-setting-1h-400s   | first turn      | 2.0   | 4     | 0        | 2,021    | 9,311  | 250    | $0.0230 |
| bearer-setting-1h-400s   | warm, mean of 6 | 2.0   | 6     | 0        | 1,228    | 19,343 | 441    | $0.0225 |
| bearer-setting-1h-400s   | after 400 s     | 2.0   | 6     | 0        | 849      | 24,893 | 449    | $0.0208 |

### The turn after a pause

The first model call of the turn after a 400-second pause shows the difference. Under 5-minute
entries it wrote 8,808 tokens on the API-key profile and 7,927 on the bearer profile, its whole
context but the shared tool definitions. Under 1-hour entries it wrote 189 and 363 tokens, the new
message alone, and read the remaining 12,300 to 12,600 from the cache. The turn after the pause cost
$0.052 to $0.056 under 5-minute entries and $0.018 to $0.021 under 1-hour entries, the cost of a
warm turn.

A 1-hour entry expires like any other. After a 62-minute pause, the first call of the 1-hour arm's
turn read nothing from the cache and wrote all 11,873 tokens of its context at the 1-hour price, and
the turn cost $0.109. No other run was active within that hour, so the shared tool definitions had
expired too.

A warm turn under 1-hour entries costs a little more, because it writes its new tokens at 2 times
the input price against 1.25 times. A warm turn writes about 1,200 tokens, so the difference is
about $0.0036 a turn on Opus 5.5. The warm means in the table differ by more than that, because each
session's calls per turn range from 1.8 to 2.2.

### What a day costs

A day's conversation cost comes to its turns, each reading the context once per call and writing its
new tokens, plus one write of the whole context for each burst that starts cold. Under 5-minute
entries every burst starts cold. Under 1-hour entries the day's first burst starts cold, and a later
burst starts cold only when the gap before it passes the hour. [`report.ts`](report.ts) prices the
token use spike's two reference days with the warm turn shape measured here: 2.1 calls, 1,209 tokens
written and 414 output tokens a turn.

| Day                             | Context | 5m     | 1h, no gap in 5-60 min | 1h, half | 1h, every gap | Break-even share |
| ------------------------------- | ------- | ------ | ---------------------- | -------- | ------------- | ---------------- |
| ordinary: 50 turns in 15 bursts | 100,000 | $9.97  | $14.65                 | $9.19    | $3.73         | 43%              |
| heavy: 100 turns in 25 bursts   | 180,000 | $30.43 | $44.30                 | $27.45   | $10.60        | 41%              |

The share is the share of gaps between bursts that fall between 5 and 60 minutes. Under 1-hour
entries with no such gap, every burst writes its context at 2 times the input price, so the day
costs about 45% more than under 5-minute entries. With every gap inside the hour, it costs under 40%
of the 5-minute day. The two lifetimes cost the same at 41% to 43%, because the cold writes dominate
both.

## Recommendation

- **Query options.** Add `promptCacheTtl` to the settings that the conversation's query options
  pass, from a cache lifetime on the model profile, and set it to `1h` for the conversation on an
  Anthropic profile. A conversation that comes back within the hour in about half its gaps between
  bursts gains, and the setting needs no new environment variable through the guest. The checker,
  the memory writer and the consolidator keep 5-minute entries, because each of their sessions
  starts fresh.
- **Price table.** Give each profile a fifth price, the 1-hour cache write, and have the counting
  proxy price the 1-hour share of a response's cache writes at it. The response splits its cache
  writes by lifetime, so the proxy needs no guess. A profile that never asks for 1-hour entries can
  set the fifth price to its cache write price. Without the fifth price, the proxy undercharges a
  1-hour write by 37.5% at Anthropic's rates.

## Untested

- A base URL other than Anthropic's API that forwards to another provider. The CLI sends the 1-hour
  request the same way, and whether such an endpoint honours it, ignores it or refuses it depends on
  the endpoint.
- The real spread of gaps between the conversation's bursts, which decides which side of the 42%
  break-even a deployment falls on.
- A real API key upstream. The proxy sent every call on the subscription login's token, so the
  measurements cover what the CLI asks for and what the API wrote for that credential.
- The CLI's cache keepalive, which only a subscription login turns on.
- A session near the compaction window. The day prices extend the measured turn shape to the token
  use spike's projected contexts.
