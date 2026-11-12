# 0040: GPT-Live speaks a voice call, and Claude's turn writes every answer

- Date: 2026-10-11
- Updated: 2026-10-25
- Status: decided

## Decision

OpenAI's GPT-Live hears and speaks a voice call. It answers small talk itself from nixie's persona,
and it hands each real request to nixie's own turn through its client delegation, so Claude writes
the answer to every request and GPT-Live speaks it.

## Why

- In the [reply run](../../research/voice-latency/voice-reply.md) on the deployment host, GPT-Live
  and Grok Voice reached first audio within noise of each other, and you heard their voices as
  equal. Both pipelines in the run spoke through Piper, which you ruled out as nixie's voice.
- Claude writes every answer to a request, so a request keeps nixie's model choice, memory context
  and route through the [decision point](../architecture/policy/decision-point.md).
- Once Claude writes the answers, Grok Voice waits for nixie's turn the same way. GPT-Live then
  leads on the long tail of its end-of-turn wait and on quiet speech, and its delegation is built
  and measured.

## Rejected alternatives

| Option                                                        | Why not                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grok Voice as nixie                                           | It answers requests with its own tool calls, so it holds no long silence, and it stops sooner when you interrupt at about half GPT-Live's cost per minute. Claude then writes none of nixie's answers, and its end-of-turn wait has a long tail. |
| Grok Voice handing requests to nixie's turn                   | It waits for the turn as GPT-Live does, and keeps Grok Voice's long end-of-turn tail. The reply run did not measure it.                                                                                                                          |
| a pipeline of speech-to-text, nixie's turn and text-to-speech | Your audio stays home, and one runtime speaks every reply. Behind Piper's voice, a pipeline either reached first audio too late or went quiet after its opener. A pipeline with a streaming cloud voice is untested.                             |

## Consequences

- Your audio goes to OpenAI, off the host.
- Two speakers write one conversation record: GPT-Live for small talk, and nixie's turn for each
  request.
- On a request that GPT-Live hands to nixie's turn, you wait while the turn runs. That wait is the
  accepted cost of Claude writing the answers.

## Changes

- 2026-10-25: GPT-Live hears and speaks a call and hands each request to nixie's turn, after the
  reply run. The first version ran the call as a pipeline of speech-to-text, nixie's turn and
  text-to-speech, and kept a speech-to-speech model as the swap if the pipeline missed a median of
  2.5 s to the full answer.
