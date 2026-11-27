# 0014: GPT-Live speaks a voice call, and Claude's turn writes every answer

- Date: 2026-10-11
- Updated: 2026-11-25
- Status: decided

## Decision

OpenAI's GPT-Live hears and speaks a voice call. It answers small talk itself from nixie's persona,
and it hands each real request to nixie's own turn through its client delegation, so Claude writes
the answer to every request and GPT-Live speaks it.

## Why

- In the [reply run](../../research/voice-latency/voice-reply.md) on the deployment host, GPT-Live
  and Grok Voice reached first audio within noise of each other, and you heard their voices as
  equal. Each pipeline in the run chained speech-to-text, Claude and text-to-speech, and both spoke
  through Piper, which you ruled out as nixie's voice.
- Claude writes every answer to a request, so a request keeps nixie's model choice, memory context
  and route through the [decision point](../architecture/policy/decision-point.md).
- Once Claude writes the answers, Grok Voice would wait for nixie's turn the same way. What sets the
  two apart is each one's own turn-taking, which the reply run measured on real speech: GPT-Live's
  end-of-turn wait has the shorter tail, it answered quiet speech that Grok Voice missed, and its
  delegation is built and measured. [Voice calls](../design/platform/channels/voice.md) designs the
  call on it.

## Rejected alternatives

| Option                                                        | Why not                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grok Voice as nixie                                           | It answers requests with its own tool calls, so it holds no long silence, and it stops sooner when you interrupt. Claude then writes none of nixie's answers, its end-of-turn wait has a long tail, and it costs $0.08 a minute to GPT-Live's $0.05. |
| Grok Voice handing requests to nixie's turn                   | It waits for the turn as GPT-Live does, and keeps Grok Voice's long end-of-turn tail. The reply run did not measure it.                                                                                                                              |
| a pipeline of speech-to-text, nixie's turn and text-to-speech | Your audio stays home, and one runtime speaks every reply. Behind Piper's voice, a pipeline either reached first audio too late or went quiet after its opener. A pipeline with a streaming cloud voice is untested.                                 |

## Consequences

- Your audio goes to OpenAI, off the host. OpenAI keeps each call for 30 days for abuse monitoring,
  even when the session sets `store: false`, as its
  [data controls page](https://developers.openai.com/api/docs/guides/your-data) says.
- Two speakers write one conversation record: GPT-Live for small talk, and nixie's turn for each
  request.
- On a request that GPT-Live hands to nixie's turn, you wait while the turn runs. That wait is the
  accepted cost of Claude writing the answers.
- A call costs $0.05 for each minute GPT-Live is active, plus nixie's Claude turns, at OpenAI's
  [GPT-Live model page](https://developers.openai.com/api/docs/models/gpt-live-1).
- A host outside the US and the EU can run calls: the
  [sideband spike](../../research/gpt-live-sideband/results.md) ran its sessions from a host in
  Australia, and they worked. OpenAI's
  [GPT-Live model page](https://developers.openai.com/api/docs/models/gpt-live-1) lists no limit on
  where the host runs. When OpenAI refuses a host's session request, the call ends before it
  connects.

## Changes

- 2026-11-27: The claim that GPT-Live serves hosts in the US and the EU only is removed, because the
  sideband spike's sessions worked from a host in Australia.
- 2026-11-25: The 30-day abuse-monitoring retention is added, after the
  [sideband spike](../../research/gpt-live-sideband/results.md).
- 2026-11-25: The cost comparison follows the providers' price pages, and the region risk is added.
  The reply run had counted GPT-Live's minutes with the delegated Claude turns.
- 2026-10-25: GPT-Live hears and speaks a call and hands each request to nixie's turn, after the
  reply run. The first version ran the call as a pipeline of speech-to-text, nixie's turn and
  text-to-speech, and kept a speech-to-speech model as the swap if the pipeline missed a median of
  2.5 s to the full answer.
