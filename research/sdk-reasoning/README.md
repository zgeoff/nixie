# Spike: the model's reasoning through the Agent SDK

This spike runs one extended-thinking turn for each model profile the deployment's role map names,
through the conversation guest's query options, and records what nixie receives of the model's
reasoning. It sets whether the event log records that reasoning, which decides whether a span in the
[moments](../../docs/design/platform/memory/moments.md) design can show it.

## Question

What does the Agent SDK return of the model's reasoning for each model profile in use: full
reasoning, a summary, a redacted block or nothing? What would recording it cost per turn in storage,
and should the event log record it as an erasable field or leave it out?

## Answer

- Under nixie's options every profile thinks, 245 to 387 thinking tokens on the spike's prompt, and
  nixie receives no readable reasoning: each thinking block holds empty text and an opaque signature
  of 1.4 to 2.3 KB.
- The `summarized` display returns a readable summary of 0.8 to 1.3 bytes per thinking token, and no
  SDK setting returns the full reasoning.
- A summary for an Opus 5.5 conversation turn comes to about 250 bytes, close to a short reply, or
  about 5 MB a year at 50 turns a day.
- None of the 9 turns returned a `redacted_thinking` block.

Ask for the `summarized` display, record the summary as an erasable field of the reply beside a
plain count of thinking tokens, and leave the signature out.

## Run it

```bash
bun install
bun run.ts
bun report.ts
```

Run it on a host whose egress adds the model credential, such as an imp sandbox. The
[setup](results.md#setup) gives the versions, the profiles and the 3 thinking settings.

## Results

The [results](results.md) hold the table of every turn, the reasons behind each finding and the full
recommendation.

## Untested

A turn with tool calls, a resumed session, and the latency of the summarized display. The
[untested list](results.md#untested) gives the rest.
