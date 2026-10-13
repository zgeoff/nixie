# 0040: The voice pipeline

- Date: 2026-10-11
- Status: decided
- Design: [client](../design/platform/channels/client.md)
- Research: [first-token spike](../design/platform/spikes/sdk-first-token/)

nixie runs a voice call as a pipeline: speech-to-text, nixie's own turn, and text-to-speech. The
turn runs on one Agent SDK process that stays open for the whole call. Each turn opens with a short
acknowledgement, and text-to-speech speaks each sentence of the reply as it arrives. The
acknowledgement never claims an outcome and never makes a promise.

A speech-to-speech model stays possible as an adapter that replaces the pipeline. It replaces the
pipeline if the pipeline misses a median of 2.5 s from the end of your speech to the full answer.

## Why

- On a live process, the first-token spike measured Haiku 5.5's first token at 0.57 s median and
  1.24 s at the 90th percentile. A full reply comes about 2 s after you stop speaking, so reply time
  does not rule out the pipeline.
- One runtime keeps one persona, one memory context and one route through the
  [decision point](../design/platform/policy/decision-point.md) for typed and spoken turns alike.
- Speech-to-text and text-to-speech can run on the host, so your audio stays home.
- An acknowledgement that cannot claim an outcome keeps a spoken reply from sounding like an
  approval, which [0002](0002-approvals.md) never takes from a chat message.

## Alternatives

- **The pipeline, with a separate small model for the acknowledgement.** It gives a faster first
  phrase, and adds a model to run and keep in step with the turn. It is the fallback if the turn's
  own first phrase feels slow.
- **A speech-to-speech model as nixie.** It gives the fastest reply. It needs a second runtime with
  its own persona, memory and route to the tools, and your audio goes to a second provider.
- **A speech-to-speech front that hands real requests to nixie's turn.** It gives fast small talk
  and native interruption. It puts 2 speakers in one conversation record and sends your audio off
  the host.
