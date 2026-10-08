# Voice transports

Report: 2.5

Sources were fetched on 2026-10-08 unless a different date is given with the source.

Three kinds of transport carry voice to the owner: a client nixie serves over WebRTC, a chat app's
voice notes or calls, and a phone line. A WebRTC client keeps audio on nixie's host and gives the
strongest owner identity through a passkey, but an iOS web app loses its microphone when it goes to
the background, so calls that ring or run with the screen locked need a native app with CallKit.
Voice notes work on every chat channel as asynchronous messages. Realtime calls with a bot work on
Discord, on WhatsApp's Calling API, and experimentally through signal-cli, while Telegram's Bot API
has no call method. A phone line through Twilio or Telnyx reaches the owner anywhere and lets nixie
ring the owner for urgent items, but caller ID proves little and the carrier carries the audio.
[Realtime voice stacks](voice.md) covers the pipeline at the far end, and
[Chat channels](channels.md) covers the channels themselves.

## Transports compared

| Transport                          | Setup                                         | Monthly cost for one owner         | Owner identity        | Audio passes through          |
| ---------------------------------- | --------------------------------------------- | ---------------------------------- | --------------------- | ----------------------------- |
| WebRTC web app                     | Domain, TLS, UDP ports, TURN                  | Host, plus TURN                    | Passkey               | nixie's host and TURN relay   |
| Native app with CallKit            | Above, plus Apple Developer Program           | $99 a year to Apple                | Passkey               | nixie's host and TURN relay   |
| Chat voice notes                   | The chat channel's bot                        | None beyond the channel            | The channel's user ID | The chat platform             |
| Discord voice channel              | Bot with DAVE support                         | None                               | Discord user ID       | Discord, end to end encrypted |
| signal-cli call tunnel             | signal-cli 0.14.2 or later                    | None                               | Signal ACI            | Signal relays, encrypted      |
| WhatsApp Calling API               | Business account at a 2,000-recipient tier    | Owner-placed calls free            | WhatsApp user ID      | Meta                          |
| Phone through Twilio Media Streams | Account, number, webhook, WebSocket           | $1.15 number plus $0.0129 per min  | Caller ID, spoofable  | Carrier and Twilio            |
| Phone through Telnyx streaming     | Account, number, Call Control app             | $1.00 number plus ~$0.0087 per min | Caller ID, spoofable  | Carrier and Telnyx            |
| Self-hosted SIP plus a trunk       | Public IP, SIP and media ports, trunk account | Trunk and number fees              | Caller ID, spoofable  | Carrier, trunk, then nixie    |

The sections below give the sources for each row.

## A client over WebRTC

A web or app client that nixie serves carries audio straight to nixie's pipeline, with Opus at 48
kHz and no transcoding. Two server shapes fit one owner:

- **Pipecat SmallWebRTCTransport** opens a direct peer connection between the client and the Pipecat
  process, with no media server. nixie writes its own signalling, serves it over HTTPS, and needs
  STUN and TURN when the client sits on another network behind strict NAT
  ([SmallWebRTC](https://docs.pipecat.ai/server/services/transport/small-webrtc)).
- **A self-hosted LiveKit server**, v1.13.9 under Apache-2.0, needs a domain with a certificate from
  a trusted authority, ports 7880 behind TLS, 7881 TCP and 50000 to 60000 UDP, and its own TURN on
  3478 UDP or TLS on 443
  ([ports and firewall](https://docs.livekit.io/home/self-hosting/ports-firewall/);
  [deployment](https://docs.livekit.io/transport/self-hosting/deployment/)). `livekit/generate`
  writes a Docker Compose and Caddy setup for one VM
  ([VM guide](https://docs.livekit.io/transport/self-hosting/vm/)). A media server earns its place
  when phone calls and app calls should join the same room.

Cloudflare Realtime TURN costs $0.05 per GB after a free 1,000 GB a month
([Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/)), and coturn is the self-hosted
alternative. TURN relays the media encrypted with DTLS-SRTP, so the relay sees only metadata. Owner
identity is a passkey login before the session starts, as
[Chat channels](channels.md#first-party-client) describes for approvals.

### iOS limits

An installed iOS web app holds a call only while it is in the foreground with the screen on.
Background audio playback works since iOS 15.4
([WebKit bug 198277](https://bugs.webkit.org/show_bug.cgi?id=198277)), but WebRTC and Web Audio stop
when the screen locks or the app goes to the background, as an open Apple forum request from
February 2025 records ([Apple forums](https://developer.apple.com/forums/thread/774239)). A 2025 bug
leaves the audio context silent after the app returns to the foreground
([WebKit bug 291892](https://bugs.webkit.org/show_bug.cgi?id=291892)). The notes found no release
note saying iOS 26 changed this. A web app also cannot ring: web push shows a notification, not an
incoming call.

### Native apps

A native iOS app rings like a phone through PushKit and CallKit, with one condition: every VoIP push
must report a call to CallKit, or the system terminates the app and eventually stops delivering its
VoIP pushes ([PushKit](https://developer.apple.com/documentation/pushkit/pkpushtype/voip)). A VoIP
push therefore cannot serve as a silent wake-up; other alerts go through ordinary notifications. On
Android, Google recommends the Core-Telecom library over ConnectionService
([Android VoIP](https://developer.android.com/develop/connectivity/telecom/voip-app)). LiveKit's
React Native SDK runs in Expo with a development build
([LiveKit Expo](https://docs.livekit.io/transport/sdk-platforms/expo/)).

## Chat apps

### Voice notes

Every chat channel in [Chat channels](channels.md) carries voice notes as files, so the owner can
speak to nixie and hear replies without a call. A voice note is a whole message: it cannot be
interrupted, and it fits nixie's text loop with STT on the way in and TTS on the way out.

- **Telegram.** `sendVoice` takes OGG with Opus, MP3 or M4A up to 50 MB
  ([Bot API](https://core.telegram.org/bots/api#sendvoice)), and `getFile` downloads up to 20 MB, or
  any size through a self-hosted Bot API server ([Bots FAQ](https://core.telegram.org/bots/faq)).
- **Signal.** signal-cli added `--voice-note` in 0.14.2, and received payloads mark voice notes
  since 0.14.8 ([CHANGELOG](https://github.com/AsamK/signal-cli/blob/master/CHANGELOG.md)).
- **WhatsApp.** Voice messages are OGG with Opus, sent with `voice: true`, up to 16 MB
  ([audio messages](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/audio-messages)).
- **Discord.** A voice message sets the `IS_VOICE_MESSAGE` flag with an OGG Opus attachment
  ([message resource](https://docs.discord.com/developers/resources/message)). The docs do not say
  whether bots may send one.

### Realtime calls

- **Telegram.** The Bot API lists no call method ([Bot API](https://core.telegram.org/bots/api)). A
  call needs a user account driven over MTProto with a library such as py-tgcalls
  ([pytgcalls](https://pypi.org/project/pytgcalls/)), and a second phone number. The API terms
  forbid actions "on behalf of the user without the user's knowledge and consent"
  ([API terms](https://core.telegram.org/api/terms)); whether Telegram tolerates an automated user
  account is unverified.
- **Signal.** signal-cli added experimental voice calling in 0.14.2
  ([CHANGELOG](https://github.com/AsamK/signal-cli/blob/master/CHANGELOG.md)). It spawns a
  `signal-call-tunnel` subprocess per call, which handles WebRTC and exposes the call's audio
  through platform audio devices
  ([call tunnel](https://github.com/AsamK/signal-cli/blob/master/docs/CALL_TUNNEL.md)). Routing
  those devices into a voice pipeline on a server is untested.
- **Discord.** A bot sends Opus audio into a voice channel as documented. Since 2026-03-01 Discord
  supports only end-to-end encrypted calls under its DAVE protocol, so a bot must advertise
  `max_dave_protocol_version`
  ([voice connections](https://docs.discord.com/developers/topics/voice-connections)).
  `@discordjs/voice` 0.19.2 supports DAVE and receives audio, but warns that receiving "is not
  documented by Discord so stable support is not guaranteed"
  ([README](https://cdn.jsdelivr.net/npm/@discordjs/voice@0.19.2/README.md)).
- **WhatsApp.** The Business Calling API has been available since July 2025
  ([Twilio changelog](https://www.twilio.com/en-us/changelog/whatsapp_business_calling_available)).
  Calls the owner places are free, and calls to the owner are unavailable from business numbers in
  the US, Canada and some other countries. Production use needs a messaging limit of at least 2,000
  unique recipients a day
  ([Calling API](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/);
  [pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/pricing/)).
  The Business Platform terms that prohibit a primary AI assistant apply to calls as much as to
  messages.
- **Matrix.** Element Call runs on a LiveKit server, with `lk-jwt-service` exchanging a Matrix
  OpenID token for a LiveKit token ([lk-jwt-service](https://github.com/element-hq/lk-jwt-service)).
  The notes found no documented way for a bot to join a call, though a bot user could in principle
  get a token the same way.
- **Slack.** Huddles have no bot API; joining one needs a real user account or a paid service such
  as Recall.ai ([Recall.ai](https://docs.recall.ai/docs/slack-huddles)).

## Phone line

A phone line reaches the owner on any phone, in a car or with the screen locked, and lets nixie ring
the owner. Requirement tier 3 lists phone calls under acting in the outside world; a line for calls
between nixie and its owner is a narrower use of the same accounts.

### Twilio

Twilio charges $1.15 a month for a US local number, $0.0085 per minute inbound, $0.0140 outbound,
$0.0044 for Media Streams and $0.07 for ConversationRelay
([Twilio voice pricing](https://www.twilio.com/en-us/voice/pricing/us)).

- **Media Streams** opens a bidirectional WebSocket per call with `<Connect><Stream>`, carrying 8
  kHz mu-law audio. A `clear` message drops buffered audio on barge-in, and `mark` messages report
  when playback finishes ([Media Streams](https://www.twilio.com/docs/voice/media-streams);
  [WebSocket messages](https://www.twilio.com/docs/voice/media-streams/websocket-messages)). The
  `mark` events give the heard-audio position that [Realtime voice stacks](voice.md) needs.
- **ConversationRelay** runs STT and TTS at Twilio and exchanges text with the app, sending
  `interrupt` with `utteranceUntilInterrupt` on barge-in
  ([ConversationRelay](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages)). It
  takes the choice of STT and TTS away from nixie.
- **Caller ID.** Outbound calls get "A" attestation only with an approved Business Profile and
  SHAKEN/STIR Trust Product
  ([onboarding](https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir/shakenstir-onboarding));
  whether an individual qualifies is not stated. An inbound webhook carries `StirVerstat` only when
  the call arrives with a SHAKEN header
  ([trusted calling](https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir)). Caller ID
  alone does not identify the owner.

### Telnyx

Telnyx charges $1.00 a month for a number, $0.002 per minute for the Voice API, $0.0032 per minute
inbound SIP and $0.0035 per minute for media streaming
([Telnyx pricing](https://telnyx.com/pricing/call-control)). Its bidirectional streams carry L16 at
16 kHz or Opus as well as the telephone codecs, and support `clear` and `mark`
([media streaming](https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming)).
Wideband audio gives the STT a better signal than Twilio's 8 kHz.

### SIP

- **OpenAI Realtime SIP** takes a trunk at `sip.api.openai.com` and notifies the app with a webhook
  ([Realtime SIP](https://developers.openai.com/api/docs/guides/realtime-sip)). The voice pipeline
  then runs at OpenAI.
- **LiveKit SIP**, self-hosted, needs Redis, a public IP, port 5060 and media ports 10000 to 20000,
  and turns each call into a room participant, so one agent serves the app and the phone
  ([SIP server](https://docs.livekit.io/transport/self-hosting/sip-server/)).
- **Pipecat** has serializers for Twilio, Telnyx, Plivo and Exotel streams
  ([telephony](https://docs.pipecat.ai/guides/telephony/overview)).
- **Asterisk AudioSocket** streams 16-bit linear audio over a small TCP protocol in both directions
  ([AudioSocket](https://docs.asterisk.org/Configuration/Channel-Drivers/AudioSocket/)).

### Owner identity on a call

Caller ID can be spoofed, so a phone call from the owner's number does not identify the owner. A
call that nixie places to the owner's number is stronger, since a spoofer cannot answer it, unless
the number has been taken over by a SIM swap or port-out. Under
[decision 0002](../../decisions/0002-approvals.md), a spoken yes is a message the model interprets,
not an approval, so a call can at most queue a proposal that the owner approves on another channel.

## Worth borrowing

- Pipecat's SmallWebRTC transport, which carries one owner's audio with no media server
- Twilio's and Telnyx's `mark` messages, which give the playback position for the heard transcript
- LiveKit SIP's mapping of a phone call to a room participant, so one agent serves every transport
- CallKit for a native app that needs to ring the owner

## Worth avoiding

- an iOS web app as the only voice client, since its microphone stops in the background
- ConversationRelay or OpenAI Realtime SIP when nixie wants its own STT, TTS or model
- caller ID as owner identity, or a spoken yes as an approval
- Telegram user accounts driven as bots for calls, whose terms are unclear
- VoIP pushes for anything other than a call

## Recommendations

- **Start voice in a web client nixie serves, over Pipecat SmallWebRTC with a TURN relay.** It keeps
  audio on nixie's host, gives a passkey identity, and needs no media server for one owner. The
  trade-off is that on iOS a call lasts only while the app is open and the screen is on.
- **Take voice notes on the chosen chat channel as the first voice feature.** They need only STT and
  TTS around the text loop and work on every channel. The trade-off is that they are not realtime
  and cannot be interrupted.
- **Add a native app with CallKit only if the owner wants calls with the screen locked or nixie
  ringing the phone.** The trade-off is the Apple Developer Program, TestFlight's 90-day builds, and
  an app to maintain.
- **Add a phone line through Telnyx streaming into nixie's own pipeline when the owner wants calls
  anywhere or urgent rings.** It costs about $1 a month plus under $0.01 a minute and keeps the
  pipeline in nixie. The trade-off is that the carrier and Telnyx carry the audio, and the call
  carries no approval.
- **Consider LiveKit as the media server if app and phone calls should share one agent.** The
  trade-off is a server with its own ports, TLS and TURN.

## Open questions

- Does the owner need calls with the screen locked? That decides between a web client and a native
  app.
- Can signal-cli's call tunnel feed a server-side pipeline without a sound card, for example through
  virtual audio devices? A spike would settle it in about half a day.
- Spike: a SmallWebRTC voice session from an installed iOS web app through a TURN relay, measuring
  added latency and recording what happens on lock and on return. About half a day, plus a device.
- Spike: a Telnyx number streaming L16 audio into the Pipecat pipeline from the voice spike, with
  `clear` on barge-in and an outbound call to the owner. About half a day, plus a paid account.
- Does an individual qualify for "A" attestation on outbound calls at Twilio or Telnyx, so the
  owner's carrier does not label nixie's calls as spam?
