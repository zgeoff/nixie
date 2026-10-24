# Spike: 1-hour prompt cache entries for the conversation

This spike runs a conversation session through the production guest turn and measures which Claude
Code CLI setting writes 1-hour prompt cache entries, and what each cache lifetime does to a turn
after a pause. Its finding sets the conversation's cache lifetime and the 1-hour write price on a
model profile.

## Question

Which CLI setting makes the conversation write 1-hour entries through a base URL other than
Anthropic's, such as the counting proxy, and what does a day of bursty turns cost with each
lifetime?

## Answer

- The `promptCacheTtl` setting, or the `CLAUDE_CODE_PROMPT_CACHE_TTL` variable, set to `1h` makes
  every model call write 1-hour entries, through any base URL. Without either, an API-key or bearer
  profile writes 5-minute entries.
- After a 400-second pause, a turn cost $0.052 to $0.056 under 5-minute entries and $0.018 to $0.021
  under 1-hour entries, the cost of a warm turn.
- A warm turn under 1-hour entries costs about $0.0036 more on Opus 5.5.
- The 1-hour lifetime makes a bursty day cheaper once 41% to 43% of the gaps between bursts fall
  between 5 and 60 minutes.

Set `promptCacheTtl: '1h'` for the conversation from a lifetime on the model profile, and give each
profile a fifth price for the 1-hour cache write.

## Run it

```bash
export MODEL_TOKEN_FILE=~/.claude/.credentials.json
bun run.ts api-key-default 400
bun run.ts api-key-setting-1h 400
bun run.ts api-key-setting-1h 3720
bun report.ts
```

The [setup](results.md#setup) gives the versions, the arms and the install from the repo root.

## Results

The [results](results.md) hold how the CLI picks a lifetime, the table per run and turn, and the
prices of an ordinary and a heavy day.

## Untested

A base URL that forwards to another provider, and the real spread of gaps between bursts. The
[untested list](results.md#untested) gives the rest.
