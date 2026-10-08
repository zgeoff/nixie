# Realtime voice stacks

Report: 2.5

Sources were fetched on 2026-10-08 unless a different date is given with the source.

Realtime voice splits into 2 shapes. A speech-to-speech API runs one vendor's model over audio and
keeps the conversation on the vendor's server. A cascaded pipeline chains speech-to-text (STT), a
text model and text-to-speech (TTS), and keeps the conversation wherever the text model's caller
keeps it. Every speech-to-speech API here runs custom function tools on the client, so nixie's
policy check stays in the path, but each one ties the conversation to its own model and caps the
session at 8 to 60 minutes. Two products keep the conversation in the client's hands while a vendor
runs the voice: OpenAI's GPT-Live 1 with client delegation, and the custom language model in Hume
EVI. Pipecat, a BSD-2-Clause Python framework, is the open cascaded option with an open turn-taking
stack; LiveKit Agents has a TypeScript port, but its best turn-taking runs only on LiveKit Cloud.
Anthropic publishes no voice or speech API. [Voice transports](transports.md) covers how audio
reaches the owner.

## What nixie needs from a voice stack

Requirement tier 2 asks for voice in both directions with interruption, and states that nixie owns
the voice session: it reconnects when a provider session ends, keeps a transcript of what the owner
heard, and brings in results without interrupting
([requirements](../../brainstorm/1.4-requirements.md#tier-2)).
[Decision 0002](../../decisions/0002-approvals.md) routes every outside action through nixie's
tools, and the principle "Any model, through adapters" puts the model behind an adapter. nixie can
therefore judge a voice stack on 5 points:

- how it handles barge-in, and whether its record matches what the owner heard
- whether tool calls come back to nixie to run, or the vendor runs them
- where the conversation state lives, and what survives a reconnect
- whether any model can sit in the middle
- latency, cost and licence

## Speech-to-speech APIs

| API                                  | Tools run by             | Conversation held by | Heard-audio record            | Session cap                  | Resume                   | Any model        | Approximate cost                |
| ------------------------------------ | ------------------------ | -------------------- | ----------------------------- | ---------------------------- | ------------------------ | ---------------- | ------------------------------- |
| OpenAI Realtime, `gpt-realtime-2.1`  | Client, except MCP       | OpenAI               | `conversation.item.truncate`  | 60 min                       | None found; re-inject    | No               | $32 and $64 per 1M audio tokens |
| OpenAI GPT-Live 1, client delegation | Client                   | Client               | Timestamped transcript deltas | Not found                    | Not found                | Yes, the backend | $0.05 per min plus the backend  |
| Gemini Live, `gemini-3.8-live`       | Client                   | Google               | Only what was sent            | 15 min audio, ~10 min socket | Handle valid 2 h         | No               | $3 and $12 per 1M audio tokens  |
| xAI Grok Voice Agent                 | Client, except built-ins | xAI                  | Not checked                   | Not found                    | 30-min `conversation_id` | No               | $0.08 per min                   |
| Amazon Nova 2 Sonic                  | Client, async            | Re-injected          | Not found                     | 8 min per connection         | None; re-inject          | No               | Unverified                      |
| Azure Voice Live                     | Client                   | Microsoft            | Realtime-style                | Not found                    | Not found                | Foundry models   | By tier                         |
| Hume EVI, custom language model      | Client's model           | Client               | Not found                     | 30 min                       | Documented               | Yes              | Unverified                      |

Sources for the table, in row order:
[OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations),
[GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation),
[Gemini Live sessions](https://ai.google.dev/gemini-api/docs/live-session),
[xAI voice agent](https://docs.x.ai/docs/guides/voice/agent),
[Nova 2 Sonic guide](https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.md),
[Azure Voice Live](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live),
[Hume custom language model](https://dev.hume.ai/docs/speech-to-speech-evi/guides/custom-language-model).

Time to first audio sits between 0.7 s and 1.35 s across these APIs in one third-party benchmark,
the July 2026 Artificial Analysis snapshot: 0.70 s for Grok think-fast-2.0, 1.18 s for Gemini 3.8
Live, 1.21 s for `gpt-realtime-2.1` at high reasoning, and 1.24 to 1.34 s for GPT-Live 1
([Artificial Analysis](https://artificialanalysis.ai/speech-to-speech)). Neither OpenAI nor Google
publishes a millisecond figure.

### OpenAI Realtime

`gpt-realtime-2.1` and `gpt-realtime-2.1-mini` are the current Realtime models, with 128K context
([model page](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)). The API carries
audio over WebRTC, WebSocket or SIP
([Realtime guide](https://developers.openai.com/api/docs/guides/realtime);
[Realtime SIP](https://developers.openai.com/api/docs/guides/realtime-sip)).

- **Barge-in.** Turn detection runs as `server_vad` or `semantic_vad`. With `interrupt_response` and
  `create_response` set to false, detection keeps running and the client decides when to interrupt
  and when to respond. `response.cancel` stops output, and `conversation.item.truncate` with
  `audio_end_ms` removes the unplayed part of the last reply and its transcript
  ([Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)).
  That call is how the server's record comes to match what the owner heard.
- **Background results.** A response with `conversation` set to `"none"` runs outside the session's
  conversation and leaves its history untouched (same source).
- **Tools.** The model emits a `function_call`, the client runs it and returns a
  `function_call_output`. Remote MCP tools of `type: "mcp"` run on OpenAI's servers, which would
  take those calls out of nixie's policy check
  ([Realtime MCP](https://developers.openai.com/api/docs/guides/realtime-mcp)).
- **Session.** A session lasts at most 60 minutes
  ([Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)).
  The notes found no resume handle, so nixie would open a new session and re-inject the history with
  `conversation.item.create`.
- **Cost.** Audio costs $32 per 1M tokens in and $64 out, at 1 token per 100 ms of input and 1 per
  50 ms of output, and the whole conversation is billed again each turn
  ([model page](https://developers.openai.com/api/docs/models/gpt-realtime-2.1);
  [Realtime costs](https://developers.openai.com/api/docs/guides/realtime-costs)).

### OpenAI GPT-Live 1

GPT-Live 1 is a full-duplex voice model that listens while it speaks and "delegate[s] reasoning and
tool use to a backend agent"
([model page](https://developers.openai.com/api/docs/models/gpt-live-1)). It runs on its own
endpoint, `v1/live/sessions`, and costs $0.05 per minute, billed per second, with the backend billed
separately. Secondary sources date its API release to 2026-09-10
([DataNorth](https://datanorth.ai/news/openai-launches-gpt-live-1-in-the-api)).

In client delegation, GPT-Live sends `session.delegation.created`, and the application builds the
backend request from its own transcript and task state; in OpenAI's words, "your application owns
permissions, confirmations, business records, and task state"
([delegation guide](https://developers.openai.com/api/docs/guides/live-delegation)). The application
responds with 3 events, each capped at 500 tokens per append:

- `session.commentary.append` for results the owner should hear
- `session.thinking.append` for context that is not spoken
- `session.instructions.append` for directives

Transcripts arrive as deltas with start and end times, and GPT-Live decides when to speak
([migration guide](https://developers.openai.com/api/docs/guides/live-migration)). When the owner
interrupts, backend work continues and the application decides whether to finish or cancel it
([Live guide](https://developers.openai.com/api/docs/guides/live)). This split matches nixie's needs
closely: the voice runs at OpenAI, while the conversation, the tools and the model behind them stay
with nixie, which could put the Agent SDK turn behind it. The session cap and reconnect behaviour
are not documented.

### Gemini Live

`gemini-3.8-live` and `gemini-3.8-live-extended-thinking` are stable models from 2026-09-15
([Gemini changelog](https://ai.google.dev/gemini-api/docs/changelog)). Google shut down its
half-cascade Live models on 2025-12-09, so every Live model is native audio.

- **Session.** An audio-only session lasts 15 minutes without context compression, and a connection
  lasts about 10 minutes; a `GoAway` message with `timeLeft` warns before the close. A resumption
  handle stays valid for 2 hours after the session ends
  ([Live sessions](https://ai.google.dev/gemini-api/docs/live-session)). Gemini Live and Grok, with
  its 30-minute cache, are the 2 APIs here that document resuming server-held state; Hume keeps the
  state on the client under its session ID.
- **Barge-in.** On an interruption the server sends `interrupted`, keeps only what it sent to the
  client, and discards pending function calls
  ([Live guide](https://ai.google.dev/gemini-api/docs/live-guide)). Sent audio is not heard audio,
  and Gemini has no truncate call, so nixie tracks the heard portion itself. With automatic activity
  detection disabled, the client sends its own `activityStart` and `activityEnd`.
- **Tools.** "The Live API doesn't support automatic tool response handling", so the client runs
  every call ([Live tools](https://ai.google.dev/gemini-api/docs/live-tools)). A `NON_BLOCKING`
  function lets the conversation go on while it runs, and its response sets `INTERRUPT`, `WHEN_IDLE`
  or `SILENT`. `SILENT` means "use that knowledge later on", which matches bringing in a background
  result without interrupting. The docs mark asynchronous calls as unsupported in Gemini 3.1 Flash
  Live; support in 3.8 Live was not confirmed.
- **Cost.** Audio costs $3 per 1M tokens in and $12 out
  ([pricing](https://ai.google.dev/gemini-api/docs/pricing)), the lowest of the major APIs.

### Anthropic

Anthropic publishes no realtime, speech-to-speech, STT or TTS API. The API overview lists Messages,
Batches, Token Counting, Models, Files, Skills and the beta Agents, Sessions and Environments APIs,
none of them audio ([API overview](https://platform.claude.com/docs/en/api/overview)), and the
release notes from late 2025 to October 2026 mention no voice feature
([release notes](https://platform.claude.com/docs/en/release-notes/overview)). Voice mode exists
only in the Claude apps. A Claude model reaches voice only as the text model behind a cascaded
pipeline or a delegating front end.

### Other APIs

- **xAI Grok Voice Agent API**, launched 2025-12-17, speaks the OpenAI Realtime protocol
  ([xAI news](https://x.ai/news/grok-voice-agent-api)). Custom functions run on the client, while
  its built-in search and `mcp` tools run at xAI. It costs $0.08 per minute for
  `grok-voice-think-fast-2.0` ([xAI models](https://docs.x.ai/docs/models)).
- **Amazon Nova 2 Sonic** caps a connection at 8 minutes and documents renewal by re-injecting
  history; its end of life is no sooner than 2026-12-02
  ([Bedrock model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.html)).
- **Azure Voice Live** offers native speech-to-speech models and cascades of Azure STT and TTS
  around a choice of text models, including other Foundry models
  ([Voice Live](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live)). Its
  model choice stays inside Azure.
- **Hume EVI** calls the developer's own OpenAI-compatible `/chat/completions` endpoint as its
  custom language model, keeps state under a `custom_session_id`, and caps a session at 30 minutes
  ([EVI overview](https://dev.hume.ai/docs/speech-to-speech-evi/overview);
  [custom language model](https://dev.hume.ai/docs/speech-to-speech-evi/guides/custom-language-model)).
- **Ultravox** costs $0.05 per minute and runs an open-weight model, with a default session cap of 1
  hour ([Ultravox pricing](https://www.ultravox.ai/pricing);
  [Ultravox tools](http://docs.ultravox.ai/tools/)).

## Cascaded pipelines

A cascaded pipeline keeps the text model swappable, which is what the adapter principle asks for.
The latency target is looser than many posts claim: a Pipecat community primer, updated June 2026,
sets 1,500 ms voice-to-voice as the target and gives a sample budget of 1,293 ms, of which the text
model's time to first byte takes 650 ms ([Voice AI primer](https://voiceaiandvoiceagents.com/)).

### Pipecat

Pipecat v1.12.0 shipped on 2026-09-26 under BSD-2-Clause, in Python
([releases](https://github.com/pipecat-ai/pipecat/releases)).

- **Turn-taking.** A turn starts on voice activity or a transcript and ends when the local Smart
  Turn v3 model decides
  ([user turn strategies](https://docs.pipecat.ai/server/utilities/turn-management/user-turn-strategies)).
  Smart Turn v3.2 is BSD-2-Clause for weights, data and training code, covers 23 languages, and runs
  in about 10 ms on some CPUs ([smart-turn](https://github.com/pipecat-ai/smart-turn)).
- **Barge-in.** Barge-in is on by default and cancels in-flight work. Text frames move in step with
  audio playback, so unplayed text never enters the context
  ([interruptions](https://docs.pipecat.ai/pipecat/fundamentals/interruptions)). A function
  registered with `cancel_on_interruption=True` is cancelled on a barge-in.
- **Any model.** Pipecat supports more than 30 text-model providers
  ([supported services](https://docs.pipecat.ai/server/services/supported-services)). Subclassing
  `LLMService` and overriding `_process_context` hands each turn to nixie's core, which keeps the
  session and runs the tools ([LLM guide](https://docs.pipecat.ai/guides/learn/llm)).
- **Language.** The server side is Python only; the TypeScript package is a client SDK
  ([pipecat-client-web](https://github.com/pipecat-ai/pipecat-client-web)). With a Bun core, Pipecat
  runs as a sidecar process.

### LiveKit Agents

livekit-agents 1.8.5 shipped on 2026-10-06 and `@livekit/agents` 1.9.1 on 2026-09-26, both
Apache-2.0 ([Python releases](https://github.com/livekit/agents/releases);
[JS releases](https://github.com/livekit/agents-js/releases)). The JS port runs on Node 18 and
later; Bun is not supported, and an open issue reports a crash under Bun on Windows
([agents-js issue 1900](https://github.com/livekit/agents-js/issues/1900)).

- **Turn detection.** LiveKit's turn-detector models fall under the LiveKit Model License, which
  forbids using them "on a standalone basis or with any frameworks other than LiveKit Agents"
  ([licence](https://huggingface.co/livekit/turn-detector/blob/main/LICENSE)). The full audio model
  runs on LiveKit Cloud, and v1-mini runs locally in under 500 MB of RAM
  ([turn detector](https://docs.livekit.io/agents/build/turns/turn-detector/)).
- **Barge-in.** Adaptive interruption handling separates real interruptions from backchannels such
  as "uh-huh", and "is available for agents deployed to LiveKit Cloud" only
  ([adaptive interruption](https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling/)).
  `resume_false_interruption` resumes speech after an apparent interruption that turns out to be
  silence. Played segments stay in the context and the segment in progress is cut where the owner
  spoke.
- **Any model.** Overriding `llm_node` plugs in a custom text model
  ([nodes](https://docs.livekit.io/agents/build/nodes/)). Preemptive generation, on by default,
  starts the model before the turn ends and throws the reply away if the context changes, at a token
  cost.

### Hosted pipelines with a custom model

Vapi, Retell, ElevenLabs Agents and the Deepgram Voice Agent API all accept a custom text model, and
all keep the session at the vendor. ElevenLabs keeps the history and sends the full message list on
each turn
([ElevenLabs custom LLM](https://elevenlabs.io/docs/agents-platform/customization/llm/custom-llm)).
Vapi posts the conversation to an OpenAI-compatible endpoint
([Vapi custom LLM](https://docs.vapi.ai/customization/custom-llm/using-your-server)). Deepgram
charges $0.059 per minute with a custom model ([Deepgram pricing](https://deepgram.com/pricing)).
The TEN framework's licence forbids deployment on end-user devices or in competition with Agora
([TEN framework](https://github.com/TEN-framework/ten-framework)), and Vocode has had no release
since 2024-06-18 ([vocode-core](https://github.com/vocodedev/vocode-core)).

### Hosted STT and TTS

| Component                       | Role                 | Latency claim             | Price                        | Source                                                                     |
| ------------------------------- | -------------------- | ------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| Deepgram Flux                   | STT with end of turn | ~260 ms end of turn       | $0.0065 per min, promotional | [Deepgram pricing](https://deepgram.com/pricing)                           |
| Deepgram Nova-3                 | Streaming STT        | Not stated                | $0.0048 per min, promotional | [Deepgram pricing](https://deepgram.com/pricing)                           |
| AssemblyAI Universal-Streaming  | Streaming STT        | ~300 ms                   | $0.15 per hour               | [AssemblyAI pricing](https://www.assemblyai.com/pricing)                   |
| OpenAI `gpt-4o-mini-transcribe` | STT                  | Not stated                | $0.003 per min               | [OpenAI pricing](https://developers.openai.com/api/docs/pricing)           |
| ElevenLabs Flash v2.5           | TTS                  | ~75 ms, excluding network | $0.04 per 1K characters      | [ElevenLabs models](https://elevenlabs.io/docs/overview/models)            |
| Cartesia Sonic-3.6              | TTS                  | Under 90 ms, marketing    | Credit plans                 | [Cartesia models](https://docs.cartesia.ai/build-with-cartesia/tts-models) |

Deepgram Flux emits `EagerEndOfTurn`, so the text model can start early, and `TurnResumed`, so nixie
can cancel that early reply
([Flux quickstart](https://developers.deepgram.com/docs/flux/quickstart)).

## Local options

A fully local cascade is feasible with permissive licences, and Kyutai's Unmute shows one working
end to end. Unmute wraps any OpenAI-compatible text model with Kyutai STT and TTS under the MIT
licence, and needs a CUDA GPU with at least 16 GB of VRAM; first audio takes about 750 ms with
everything on one L40S and about 450 ms on separate GPUs
([Unmute](https://github.com/kyutai-labs/unmute)).

| Component            | Role        | Version and date              | Licence                            | Hardware or latency                          | Source                                                                                        |
| -------------------- | ----------- | ----------------------------- | ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Silero VAD           | VAD         | v6.2.3, 2026-09-23            | MIT                                | Under 1 ms per 30 ms chunk on one CPU thread | [silero-vad](https://github.com/snakers4/silero-vad)                                          |
| Smart Turn v3.2      | End of turn | v3.2                          | BSD-2-Clause                       | ~10 ms on some CPUs                          | [smart-turn](https://github.com/pipecat-ai/smart-turn)                                        |
| whisper.cpp          | STT         | v1.9.5, 2026-10-06            | MIT                                | Sliding window, not true streaming           | [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases)                      |
| Kyutai STT 1B        | STT         | delayed-streams-modeling      | Apache-2.0 code, CC-BY-4.0 weights | 0.5 s delay, semantic VAD                    | [delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling)           |
| Moonshine streaming  | STT         | v0.1.5, 2026-08-24            | MIT                                | On device, including WASM                    | [Moonshine models](https://moonshine-voice.readthedocs.io/en/latest/models/available-models/) |
| Parakeet TDT 0.6B v3 | STT         | v3                            | CC-BY-4.0                          | GPU                                          | [Hugging Face](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)                            |
| Kokoro-82M           | TTS         | v1.0, 2025-01-27              | Apache-2.0                         | CPU                                          | [Hugging Face](https://huggingface.co/hexgrad/Kokoro-82M)                                     |
| Kyutai Pocket TTS    | TTS         | v3.3.0, 2026-09-24            | MIT code, CC-BY-4.0 weights        | 2 CPU cores, ~200 ms to first chunk          | [pocket-tts](https://github.com/kyutai-labs/pocket-tts)                                       |
| Piper                | TTS         | piper1-gpl v1.8.0, 2026-09-04 | GPL-3.0                            | CPU                                          | [piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)                                         |
| Chatterbox Turbo     | TTS         | 350M parameters               | MIT, watermarked output            | GPU or CPU                                   | [chatterbox](https://github.com/resemble-ai/chatterbox)                                       |

Piper moved from the archived MIT `rhasspy/piper` repo to the GPL-3.0 `piper1-gpl`, which matters if
nixie embeds it. Kyutai's Moshi is a speech-to-speech model and cannot put another model in the
middle.

## Worth borrowing

- OpenAI's `conversation.item.truncate` with `audio_end_ms`, which cuts the record to what the owner
  heard
- turn detection that keeps running while the client decides when to respond, as OpenAI's
  `create_response: false` allows
- GPT-Live's client delegation, which keeps tools, permissions and task state with the application
  while the vendor runs the voice
- Gemini's `SILENT` and `WHEN_IDLE` scheduling for tool results, which lets a background result
  arrive without interrupting
- Gemini's resumption handle and `GoAway` warning, as the shape for nixie's own reconnect
- Pipecat's playback-synchronised text frames, so unplayed text never enters the context
- Deepgram Flux's eager end of turn with a cancel event
- `resume_false_interruption`, so a cough does not end a reply

## Worth avoiding

- server-run MCP tools in any voice API, which bypass nixie's policy check
- hosted pipelines that keep the conversation and send the full history to a custom model each turn
- LiveKit's turn-detector models, whose licence ties them to LiveKit Agents, and its adaptive
  interruption, which runs only on LiveKit Cloud
- treating what the server sent as what the owner heard, as Gemini's history does
- Moshi or any speech-to-speech model as the only voice path, since it removes the adapter

## Recommendations

- **Build voice as a cascade around nixie's own turn, with Pipecat as the first framework.**
  Pipecat's licence, turn model and VAD are all open, its playback-synchronised context gives the
  heard transcript, and a custom `LLMService` hands each turn to nixie's core. The trade-off is a
  Python sidecar beside a Bun core, and a voice-to-voice delay near the 1.3 to 1.5 s range of the
  primer's budget, which the Agent SDK's own turn overhead may push higher.
- **Evaluate GPT-Live 1 with client delegation as the hosted alternative.** It gives full-duplex
  speech while nixie keeps the conversation, the tools and the model behind them, so it meets the
  adapter principle at the voice layer. The trade-off is that OpenAI hears all the owner's audio,
  the session cap and reconnect rules are undocumented, and it costs $0.05 a minute plus the
  backend.
- **If a speech-to-speech model runs the conversation, prefer Gemini Live, and keep nixie's
  transcript as the record.** Gemini has the resumption handle, non-blocking tools with silent
  results, and the lowest audio price. The trade-off is one vendor's model in the conversation, a
  15-minute session, and a record of sent audio that nixie must correct to heard audio itself.
- **Keep a local cascade as the private-data path:** Silero VAD, Smart Turn, Kyutai STT or
  Moonshine, a local text model, and Kokoro or Pocket TTS. The trade-off is a GPU host for the STT
  and model, and lower quality than the hosted voices.

## Open questions

- How long does an Agent SDK turn take to its first token, and does it fit a 1.5 s voice budget? If
  not, a voice turn may need a faster model that hands work to the main thread as tool calls.
- Does a voice proposal end the spoken turn the same way a text proposal ends a text turn under
  0002, and how does the owner approve while speaking? A spoken "yes" is a chat message the model
  interprets, so the approval would come from a button on the screen or a channel push.
- What are GPT-Live's session cap and reconnect behaviour?
- Does Gemini 3.8 Live support `NON_BLOCKING` calls and context compression? Its model page and the
  tools page disagree.
- Spike: a Pipecat pipeline with a custom `LLMService` that calls a stub of nixie's core over HTTP,
  measuring voice-to-voice latency and barge-in with Silero and Smart Turn, and checking that the
  context holds only heard text. About 1 day.
- Spike: a reconnect test that ends a Realtime or Gemini Live session mid-conversation, re-injects
  nixie's transcript or uses the resumption handle, and checks that the model continues without
  repeating itself. About half a day.
- Spike: a local cascade on the owner's GPU host with Kyutai STT, a local model and Pocket TTS,
  measuring first audio. About 1 day.
