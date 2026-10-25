# 0040: What speaks a voice call

- Date: 2026-10-11
- Updated: 2026-10-25
- Status: decided
- Design: [client](../design/platform/channels/client.md),
  [voice calls](../design/platform/channels/voice.md)
- Research: [first-token spike](../../research/sdk-first-token/),
  [reply run](../../research/voice-latency/voice-reply.md)

OpenAI's GPT-Live hears and speaks a voice call. It answers small talk itself from nixie's persona,
and it hands each real request to nixie's own turn through its client delegation, so Claude writes
the answer to every request and GPT-Live speaks it. While the turn runs, GPT-Live speaks a short
filler, such as "Sure, one moment". The filler never claims an outcome and never makes a promise.

A reply meets two gates: first audio at a median of 1.5 s or less from the end of your speech, and a
silence over 1 s inside the reply in fewer than 5% of turns. GPT-Live meets the first gate. On a
request it hands to nixie's turn, you wait after the filler while the turn runs, so GPT-Live misses
the silence gate on those turns. That wait is the accepted cost of Claude writing the answers.

## Why

- In the [reply run](../../research/voice-latency/voice-reply.md) on the deployment host, GPT-Live
  and Grok Voice reached first audio within noise of each other, and you heard their voices as
  equal. Both pipelines in the run spoke through Piper, which you ruled out as nixie's voice.
- Claude writes every answer to a request, so a request keeps nixie's model choice, memory context
  and route through the [decision point](../design/platform/policy/decision-point.md).
- Once Claude writes the answers, Grok Voice waits for nixie's turn the same way. GPT-Live then
  leads on the long tail of its end-of-turn wait and on quiet speech, and its delegation is built
  and measured.
- A filler that cannot claim an outcome keeps a spoken reply from sounding like an approval, which
  [0002](0002-approvals.md) never takes from a chat message.

The choice has two costs. Your audio goes to OpenAI, off the host. Two speakers write one
conversation record: GPT-Live for small talk, and nixie's turn for each request.

## Alternatives

- **Grok Voice as nixie.** It answers requests with its own tool calls, so it holds no long silence,
  and it stops sooner when you interrupt at about half GPT-Live's cost per minute. Claude then
  writes none of nixie's answers, and its end-of-turn wait has a long tail.
- **Grok Voice handing requests to nixie's turn.** It waits for the turn as GPT-Live does, and keeps
  Grok Voice's long end-of-turn tail. The reply run did not measure it.
- **A pipeline of speech-to-text, nixie's turn and text-to-speech.** Your audio stays home, and one
  runtime speaks every reply. Behind Piper's voice, a pipeline either reached first audio too late
  or went quiet after its opener. A pipeline with a streaming cloud voice is untested.

## Changes

- 2026-10-25: GPT-Live hears and speaks a call and hands each request to nixie's turn, after the
  reply run. The first version ran the call as a pipeline of speech-to-text, nixie's turn and
  text-to-speech, and kept a speech-to-speech model as the swap if the pipeline missed a median of
  2.5 s to the full answer.
