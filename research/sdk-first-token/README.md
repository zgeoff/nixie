# Spike: Agent SDK time to first token

This spike times an Agent SDK turn in nixie's assistant placement, from the call that sends the
prompt to the first streamed text token and to the result. It measures the placement from decision
[0003](../../docs/decisions/0003-sdk-placement.md), and its numbers back the voice pipeline in
decision [0040](../../docs/decisions/0040-voice-pipeline.md).

## Question

How long does a turn take from the moment nixie sends the prompt to the first streamed text token,
and to the end of the turn? How do a new process per turn, a resumed session, and a process kept
alive between turns compare, and how much do nixie's in-process tools add?

## Answer

- The SDK adds about 10 ms to a turn on a live process and about 270 ms to a turn on a new process.
  A config folder that no earlier run filled adds about 400 ms more.
- The model's time to its first token decides the turn. From request to first text, Haiku 5.5 at low
  effort took 0.6 s at the median, Sonnet 5.5 at low effort 1.5 s, and Haiku 4.5 1.9 s with extended
  thinking on.
- On a live process, Haiku 5.5 gave the first text token at 0.57 s at the median and 1.24 s at the
  90th percentile.
- Three in-process tools changed nothing measurable for Haiku 5.5.
- `startup()` and `prewarm()` move the process start ahead of the turn and leave 25 to 70 ms on it.

Run voice on Haiku 5.5, with one process held open for the call and Claude Code's config folder kept
across restarts.

## Run it

```bash
bun install
CLAUDE_CODE_OAUTH_TOKEN=$(OP_SERVICE_ACCOUNT_TOKEN=<service_account_token> op read "op://nixie/claude-code-oauth-token/credential") \
  env -u ANTHROPIC_API_KEY bun bench.ts --out results/<run_name>.jsonl --samples 10
bun report.ts results/<run_name>.jsonl --by model,mode
```

The [setup](results.md#setup) gives the versions, the 6 start modes and the flags.

## Results

The [results](results.md) hold every timing table, the run with extended thinking off, and where a
new process spends its time.

## Untested

Long contexts, a turn that calls a tool, and a process held open for a long call. The
[untested list](results.md#untested) gives the rest.
