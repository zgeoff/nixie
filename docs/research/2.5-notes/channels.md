# Chat channels

Report: 2.5

Sources were fetched on 2026-10-08 unless a different date is given with the source.

No chat channel meets all 3 of nixie's needs at once: a button that carries an approval bound to one
proposal, an owner identity that nixie can check on that button press, and messages that stay on
hosts the owner controls. Telegram comes closest on approvals and conversation. Its inline buttons
carry an opaque proposal ID, its Mini Apps carry a signed user ID, and Bot API 10.3 streams drafts
with a stop button ([Bot API changelog](https://core.telegram.org/bots/api-changelog)). Its bot
chats rest on Telegram's servers without end-to-end encryption
([Telegram FAQ](https://telegram.org/faq)). A self-hosted Matrix server keeps messages home and
gives the strongest sender check, but Matrix has no button standard. A first-party client with
WebAuthn gives the strongest proof on the approval itself, at the cost of building and installing an
app. WhatsApp's Business Platform bars general-purpose AI assistants, and Signal and iMessage have
no bot API. [Voice transports](transports.md) covers voice notes and calls on these channels, and
[Approvals and owner friction](../2.3-notes/approvals.md) covers the approval record that a button
resolves.

## What a channel needs to carry

[Decision 0002](../../decisions/0002-approvals.md) makes an approval an action that nixie checks,
never a chat message the model interprets. [Decision 0006](../../decisions/0006-approval-record.md)
binds each approval to one proposal's action hash and requires nixie to check that the answer came
from the owner's identity on that channel. The 2.3 notes recommend keeping the snapshot on the
server and sending the client only an opaque ID. A channel therefore needs 4 things for approvals:

- a button or action whose payload holds an opaque proposal ID, such as a 26-character ULID
- a callback that the platform authenticates, so nobody can forge a press by posting to nixie's
  endpoint
- a user ID on the callback that the platform sets, which nixie compares with the owner's stored ID
- a way to replace or disable the button after use, so the owner sees that the approval was consumed

[Decision 0005](../../decisions/0005-effects-and-taint.md) and the owner-message findings in the
[2.2 and 2.3 landscape](../2.2-2.3-core-and-policy.md#owner-messages) make the conversation
multi-message and interruptible. For that, a channel needs edits of the bot's own messages, a typing
or status indicator, and ideally a streamed draft that the owner can stop.

## Channels compared

| Channel                  | Owner check on a button press         | Button payload limit      | Push any time        | Streaming or edits      | Messages rest at      | Terms risk for a personal bot |
| ------------------------ | ------------------------------------- | ------------------------- | -------------------- | ----------------------- | --------------------- | ----------------------------- |
| Telegram                 | Secret header plus `from.id`          | 64 bytes                  | Yes, after `/start`  | Drafts with stop, edits | Telegram cloud        | Low                           |
| Signal via signal-cli    | End-to-end sender ACI                 | No buttons; polls         | Yes                  | Edits, 10 in 24 h       | Owner's host          | Medium                        |
| WhatsApp Cloud API       | HMAC header plus user ID              | 256 characters, 3 buttons | 24-hour window       | No edits                | Meta, up to 30 days   | Prohibited                    |
| iMessage via BlueBubbles | Sender handle from a Mac              | No buttons                | Yes                  | Edits with Private API  | Apple and the Mac     | Unverified                    |
| Slack                    | HMAC signature plus `user.id`         | 2,000 characters          | Yes                  | Stream API, edits       | Slack cloud           | Low                           |
| Discord                  | Ed25519 signature plus `user.id`      | 100 characters            | Shared server needed | Edits only              | Discord cloud         | Low, unverified               |
| Matrix, self-hosted      | Verified device on an encrypted event | No buttons; reactions     | Yes                  | Edits, threads          | Owner's server        | None                          |
| Email                    | Aligned DKIM, then a link             | Signed link               | Yes                  | None                    | Mail host             | Low                           |
| SMS                      | Sender number only                    | No buttons; reply codes   | Yes, after 10DLC     | None                    | Provider and carriers | Low once registered           |
| First-party app or PWA   | Passkey on the approval page          | Unbounded                 | Yes, web push        | Whatever nixie builds   | Owner's host          | None                          |

The sections below give the sources for each row.

## Telegram

Telegram has the richest approval primitives among the hosted chat apps. Bot API 10.3 shipped on
2026-08-24 ([changelog](https://core.telegram.org/bots/api-changelog)).

- **Owner identity.** `setWebhook` takes a `secret_token`, which Telegram sends in the
  `X-Telegram-Bot-Api-Secret-Token` header of every update
  ([Bot API](https://core.telegram.org/bots/api)). nixie compares `from.id` on each message and each
  `CallbackQuery` with the owner's stored ID. Long polling avoids a public webhook. A press can be
  forged only through the owner's own Telegram account.
- **Buttons.** Inline `callback_data` holds 1 to 64 bytes, enough for an opaque proposal ID. The
  client shows a progress bar until the bot calls `answerCallbackQuery`
  ([Bot API](https://core.telegram.org/bots/api)). Bot API 10.3 added disabled buttons and an
  ephemeral message that replaces the pressed message, which fits a press that disables its own
  button.
- **Mini Apps.** A Mini App receives `initData`, which Telegram signs: the key is
  `HMAC_SHA256(<bot_token>, "WebAppData")`, the bot recomputes the hash over the sorted fields, and
  `auth_date` bounds its age ([Mini Apps](https://core.telegram.org/bots/webapps)). The `user` field
  inside the signed payload gives the owner's ID, so a Mini App can host a full approval page or the
  digest sheet from 0006 with the server-side snapshot.
- **Conversation.** `sendMessageDraft` streams a partial message as a 30-second preview, opened to
  all bots in 9.5 on 2026-03-01. Its `can_stop` option shows a stop button that sends the bot a
  `stopped_message_generation` update, added in 10.2 and 10.3
  ([changelog](https://core.telegram.org/bots/api-changelog)). The bot edits its own messages with
  no stated time limit, and `sendChatAction` shows typing for 5 s or less
  ([Bot API](https://core.telegram.org/bots/api)). Topics in private chats, from 9.3 and 9.4, give
  threads in a one-to-one chat.
- **Push.** A bot cannot start a conversation, so the owner sends `/start` once; after that the bot
  messages at any time ([Bots](https://core.telegram.org/bots)).
- **Rate limits.** About 1 message per second per chat and 30 per second overall
  ([Bots FAQ](https://core.telegram.org/bots/faq)). Streaming through drafts avoids spending that
  budget on edits.
- **Terms.** The bot developer terms forbid collecting data to build datasets or AI products,
  require deleting data on request, and require encryption at rest
  ([Bot developer terms](https://telegram.org/tos/bot-developers)). Nothing there forbids a personal
  assistant.
- **Privacy.** Bot chats are cloud chats with server-client encryption only, and the Bot API offers
  no secret chats ([Telegram FAQ](https://telegram.org/faq)). Telegram holds the conversation text.

## Signal

Signal keeps messages end to end encrypted, but it has no bot API and no buttons. The unofficial
signal-cli reached v0.14.9 on 2026-10-07, and signal-cli-rest-api 0.101 shipped on 2026-09-25
([signal-cli releases](https://github.com/AsamK/signal-cli/releases);
[signal-cli-rest-api releases](https://github.com/bbernhard/signal-cli-rest-api/releases)).

- **Deployment.** signal-cli either registers its own number or links as a secondary device of the
  owner's account; v0.14.9 added linking for accounts without a phone number
  ([CHANGELOG](https://github.com/AsamK/signal-cli/blob/master/CHANGELOG.md)).
- **Owner identity.** Each inbound envelope carries `sourceUuid`, the sender's ACI, over
  signal-cli's local JSON-RPC socket, so no webhook exists to forge
  ([JSON-RPC man page](https://github.com/AsamK/signal-cli/blob/master/man/signal-cli-jsonrpc.5.adoc)).
  The Signal protocol authenticates the sender. With `--trust-new-identities never`, a changed
  safety number stops messages until the owner verifies it
  ([man page](https://github.com/AsamK/signal-cli/blob/master/man/signal-cli.1.adoc)). The REST
  wrapper has no authentication of its own and must stay off the public network.
- **Approvals.** `sendPollCreate` posts 2 to 10 options, and a vote holds the poll's author and
  timestamp, so each vote binds to one poll message
  ([man page](https://github.com/AsamK/signal-cli/blob/master/man/signal-cli.1.adoc)). A reaction
  binds to one message the same way. nixie maps the message to the proposal ID on its side, and the
  owner sees no structured details beyond the message text.
- **Conversation.** `send --edit-timestamp` edits a message, and Signal allows 10 edits within 24
  hours ([Signal support](https://support.signal.org/hc/en-us/articles/6255134251546-Edit-Message)).
  `sendTyping` shows typing for 15 s. Signal has no streamed draft.
- **Terms.** Signal's terms forbid "bulk messaging, auto-messaging, and auto-dialing" and creating
  accounts "through unauthorized or automated means" ([Signal terms](https://signal.org/legal/)).
  One low-volume personal bot falls outside the bulk cases, but nothing official permits it, and an
  account could be cut off.
- **Privacy.** Keys and messages rest in `$XDG_DATA_HOME/signal-cli/data/` on nixie's host, and the
  README describes no encryption at rest ([signal-cli](https://github.com/AsamK/signal-cli)).

## WhatsApp

WhatsApp's Business Platform rules out a personal assistant on its terms. The Meta Terms for the
WhatsApp Business Platform, dated 2026-09-23, strictly prohibit AI providers "when such technologies
are the primary" functionality
([Meta terms](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform)); press
reports give 2026-01-15 as the date it applied to all users
([TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/)).
The rest of the Cloud API, on Graph API v26.0 of 2026-07-29, fits poorly too
([Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog)):

- Webhooks carry an HMAC of the body in `X-Hub-Signature-256`, keyed by the app secret
  ([webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)). Since April
  2026 they carry a business-scoped `user_id`, which is the stable owner key once usernames replace
  phone numbers
  ([business-scoped user IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/)).
- Reply buttons allow 3 per message with IDs of up to 256 characters
  ([reply buttons](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages)).
- The API has no edit of a sent message
  ([send messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)),
  and a pair limit of 1 message every 6 s to one user works against multi-message replies
  ([Cloud API overview](https://developers.facebook.com/docs/whatsapp/cloud-api/overview)).
- Outside the 24-hour customer service window, only paid templates can be sent, under per-message
  pricing since 2025-07-01 ([pricing](https://developers.facebook.com/docs/whatsapp/pricing)). From
  2026-02-16, AI providers pay about $0.0691 per non-template message in the countries listed
  ([AI provider pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers/)).
- Messages pass through Meta and stay up to 30 days
  ([data privacy](https://developers.facebook.com/docs/whatsapp/cloud-api/overview/data-privacy-and-security)).

Unofficial clients such as Baileys and whatsmeow break the consumer terms, which forbid
"auto-messaging" and threaten a ban
([WhatsApp terms](https://www.whatsapp.com/legal/terms-of-service);
[WhatsApp FAQ](https://faq.whatsapp.com/520312452657376/?locale=en_US)). A ban there would cost the
owner their personal WhatsApp account if the bot runs on it.

## iMessage

iMessage has no route for a personal bot. Apple Messages for Business needs an approved messaging
provider and forbids "a limited or bot-only solution" and unsolicited messages
([Apple policies](https://register.apple.com/resources/messages/messaging-documentation/policies)).
The bridges need a Mac that stays on:

- BlueBubbles Server v1.9.9 dates from 2025-05-16. Its REST API authenticates with a password query
  parameter, and its webhooks carry no signature that the notes found
  ([BlueBubbles server](https://github.com/BlueBubblesApp/bluebubbles-server);
  [REST and webhooks](https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks)).
  Typing, replies and edits need its Private API bundle, documented as tested up to macOS 13
  ([Private API](https://docs.bluebubbles.app/private-api/)).
- mautrix-imessage has no releases and needs System Integrity Protection disabled for all features
  ([mautrix-imessage](https://github.com/mautrix/imessage)).

Owner identity would rest on the sender handle that the Mac reports, over a link that nixie must
keep on a private network.

## Slack

Slack has the most complete agent features of any hosted channel, at the cost of a third-party cloud
and a workspace to run.

- **Owner identity.** Slack signs each HTTP request with an HMAC-SHA256 of `v0:{timestamp}:{body}`
  in `X-Slack-Signature`, and the docs reject requests older than 5 minutes
  ([verifying requests](https://docs.slack.dev/authentication/verifying-requests-from-slack)).
  Socket Mode replaces the signature with a pre-authenticated WebSocket
  ([Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode)). nixie compares
  `user.id` and `team.id` in the `block_actions` payload with the owner's IDs
  ([block_actions](https://docs.slack.dev/reference/interaction-payloads/block_actions-payload)).
- **Buttons.** A button's `value` holds up to 2,000 characters and its `action_id` up to 255
  ([button element](https://docs.slack.dev/reference/block-kit/block-elements/button-element)). The
  app answers within 3 s
  ([handling interaction](https://docs.slack.dev/interactivity/handling-user-interaction)).
- **Conversation.** `chat.startStream`, `chat.appendStream` and `chat.stopStream` stream a reply
  ([chat.startStream](https://docs.slack.dev/reference/methods/chat.startStream)). The 2026-08-20
  changelog adds `agents.sessions.setStatus` in place of the assistant-thread status methods, and
  moves agent apps to `agent_view`
  ([changelog](https://docs.slack.dev/changelog/2026/08/20/agent-updates)). Threads are native, and
  `chat.update` edits.
- **Limits and terms.** The May 2025 limit on `conversations.history` applies to commercially
  distributed apps outside the Marketplace, not to internal apps
  ([rate-limit change](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps)).
  Slack states that some AI features need a paid plan without naming them
  ([developing agents](https://docs.slack.dev/ai/developing-agents)). A free workspace hides history
  older than 90 days and deletes data older than 1 year
  ([free plan limits](https://slack.com/help/articles/27204752526611-Feature-limitations-on-the-free-version-of-Slack)).

## Discord

Discord carries buttons and signed interactions, but its text is not end to end encrypted and a bot
cannot freely open a DM.

- **Owner identity.** HTTP interactions carry an Ed25519 signature over the timestamp and body
  ([interactions](https://docs.discord.com/developers/interactions/overview)); the gateway is the
  alternative. Discord documents no freshness window for the timestamp.
- **Buttons.** `custom_id` holds up to 100 characters, which fits a ULID
  ([components](https://docs.discord.com/developers/components/reference)).
- **Conversation.** Edits are allowed, typing lasts 10 s per call, and threads exist only in server
  channels, not in DMs ([channel](https://docs.discord.com/developers/resources/channel)). Discord
  has no streamed draft.
- **Push.** The docs say DMs "should generally be initiated by a user action"
  ([user resource](https://docs.discord.com/developers/resources/user)). A private server holding
  only the owner and the bot avoids the question.
- **Terms.** The developer policy bans training on message content; the notes could read it only
  through a search snippet.

## Matrix

A self-hosted Matrix server gives the strongest sender check of any chat channel and keeps every
message home. Spec v1.19 was published on 2026-07-08
([spec changelog](https://spec.matrix.org/v1.19/changelog/v1.19/)).

- **Owner identity.** On a homeserver with federation off, the server sets `sender` from the access
  token. On an encrypted event, matrix-rust-sdk reports `VerificationState::Verified` when the event
  "is guaranteed to be authentic as it is coming from a device belonging to a user that we have
  verified"
  ([VerificationState](https://docs.rs/matrix-sdk-common/latest/matrix_sdk_common/deserialized_responses/enum.VerificationState.html)).
  Requiring both protects an approval even against a stolen homeserver token. The owner verifies the
  bot once with a cross-signing emoji check.
- **Approvals.** Matrix has no button standard: bot buttons are an open proposal, MSC4139, and polls
  (MSC3381) are not in the spec
  ([MSC3381](https://github.com/matrix-org/matrix-spec-proposals/pull/3381)). A reaction on the
  proposal message works as a press: nixie maps the event ID to the proposal and checks the sender
  and the verified state. A link to a first-party approval page is the other route.
- **Conversation.** Edits (`m.replace`), threads (`m.thread`) and typing are in the spec. Streaming
  means repeated edits, which Synapse rate-limits to 0.2 per second with a burst of 10 by default;
  the admin API lifts the limit for one user
  ([user admin API](https://element-hq.github.io/synapse/latest/admin_api/user_admin_api.html)).
  Element X supports threads only partly
  ([Element blog](https://element.io/blog/element-x-and-pro-updates-a-glimpse-into-the-future/)).
- **Push.** Pushes reach the phone through a push gateway and then Apple or Google. With
  `event_id_only`, the push carries no message content
  ([push gateway API](https://spec.matrix.org/v1.19/push-gateway-api/)).
- **Servers and SDKs.** Synapse, Tuwunel v1.9.3 (the successor to conduwuit) and Continuwuity are
  maintained ([Synapse releases](https://github.com/element-hq/synapse/releases);
  [Tuwunel releases](https://github.com/matrix-construct/tuwunel/releases)). matrix-js-sdk uses Rust
  crypto only since v37
  ([matrix-js-sdk releases](https://github.com/matrix-org/matrix-js-sdk/releases)).

## Email

Email works for pushes and digests but proves little about the sender. Gmail, Fastmail and
Outlook.com publish `p=none` DMARC policies, checked by DNS lookup, so a forged From header is not
rejected by policy. nixie would enforce its own rule: a passing DKIM signature aligned with the From
domain, read from nixie's own mail server, plus an exact address match. An aligned signature from
gmail.com proves only that some Gmail user sent the mail, so a custom domain makes the check
stronger.

An email approval is a signed, single-use, expiring link bound to the proposal ID. The link opens a
confirm page and only a POST acts, because Microsoft Safe Links opens links to scan them
([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5283972/safe-links-and-url-detonation)).
The link proves possession of the mailbox, not a fresh owner action, so the confirm page needs its
own login. JMAP gives push for inbound mail
([RFC 8620](https://www.rfc-editor.org/rfc/rfc8620.html)), and Gmail's `users.watch` notifications
"may be delayed or dropped"
([Gmail push](https://developers.google.com/workspace/gmail/api/guides/push)).

## SMS and RCS

SMS is the weakest channel for approvals. Twilio and Telnyx sign their webhooks
([Twilio](https://www.twilio.com/docs/usage/webhooks/webhooks-security);
[Telnyx](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks)), but that proves
only the provider: the owner is just a phone number, which a SIM swap or a port-out takes over. SMS
has no buttons, and the only substitute is a reply code that nixie maps to a proposal.

US carriers block unregistered 10DLC traffic, and texting your own phone is not exempt
([Twilio error 30034](https://www.twilio.com/docs/api/errors/30034)). A Sole Proprietor brand needs
no Employer Identification Number (EIN) and allows 1 campaign on 1 number
([Twilio sole proprietor](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview));
Telnyx charges $4.50 for the brand, $15 for vetting and $2 a month
([Telnyx fees](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges)). Twilio
charges $0.0083 per US segment plus carrier fees
([Twilio SMS pricing](https://www.twilio.com/en-us/sms/pricing/us)).

RCS Business Messaging adds suggested replies with a `postbackData` of up to 2,048 characters
([RBM reference](https://developers.google.com/business-communications/rcs-business-messaging/reference/rest/v1/phones.agentMessages)),
and iOS 18.1 supports it on most major US carriers
([Twilio blog](https://www.twilio.com/en-us/blog/insights/trends/rcs-business-messaging-apple-update)).
Launching an agent needs an EIN and carrier approval, which closes it to an individual
([Twilio RCS onboarding](https://www.twilio.com/docs/rcs/onboarding)). An unlaunched agent reaches
only invited test devices
([RBM testing](https://developers.google.com/business-communications/rcs-business-messaging/guides/build/test)).

## First-party client

A client that nixie serves itself gives the strongest proof on the approval and keeps every message
home, and it costs the build. WebAuthn Level 3 became a W3C Recommendation on 2026-08-25
([WebAuthn 3](https://www.w3.org/TR/webauthn-3/)). An approval page can derive the WebAuthn
challenge from the proposal ID and the action hash, with user verification required, so the signed
assertion covers that one action. WebAuthn has no standard transaction-confirmation extension, so
this binding is nixie's own design.

Web push reaches the owner on every platform, but iOS limits it:

- iOS and iPadOS 16.4 and later deliver web push only to a web app installed on the Home Screen,
  after a permission request that follows a tap
  ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  Declarative Web Push in Safari 18.4 needs no service worker
  ([WebKit blog](https://webkit.org/blog/16535/meet-declarative-web-push/)).
- Notification action buttons work in Chrome, Edge and Firefox, not in Safari or on iOS
  ([MDN compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/ServiceWorkerRegistration.json)).
  On iOS the push opens the approval page.
- A push payload holds about 3,993 bytes of plaintext
  ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html)), so it carries the proposal ID and a
  summary, not the snapshot.

A native app adds notification buttons with `isAuthenticationRequired`, which forces a device unlock
before the action runs
([Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)). It needs the
$99-a-year Apple Developer Program for push
([Apple memberships](https://developer.apple.com/support/compare-memberships/)), and TestFlight
builds expire after 90 days
([TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)).

Self-hosted ntfy v2.29.0 offers up to 3 actions per notification
([ntfy releases](https://docs.ntfy.sh/releases/); [ntfy publish](https://docs.ntfy.sh/publish/)).
Its `http` action sends a fixed bearer request, so a press proves nothing about who pressed it, and
on iOS a self-hosted server relays through ntfy.sh ([ntfy config](https://docs.ntfy.sh/config/)).
UnifiedPush works on Android and Linux, not iOS
([UnifiedPush FAQ](https://unifiedpush.org/users/faq/)).

## Other options

- **Mattermost**, self-hosted, posts interactive button presses to the integration URL with the user
  ID and a context object that can hold an HMAC
  ([interactive messages](https://docs.mattermost.com/developers/integrate/plugins/interactive-messages)).
  It is the self-hosted chat option with real buttons.
- **Delta Chat** bots run on chatmail core over JSON-RPC, and a webxdc app can serve an interactive
  page ([Delta Chat bots](https://bots.delta.chat/development.html)). How a bot verifies its owner
  was not checked.
- **SimpleX** bots drive the CLI over a WebSocket
  ([simplex-chat on npm](https://www.npmjs.com/package/simplex-chat)); the notes found no buttons.
- **XMTP** agents tie identity to a crypto wallet
  ([XMTP agents](https://docs.xmtp.org/agents/get-started/intro)).
- **Bluesky DMs** run through a central service without end-to-end encryption or buttons
  ([chat API](https://docs.bsky.app/docs/api/chat-bsky-convo-get-convo)).
- **Google Business Messages** shut down on 2024-07-31
  ([release notes](https://developers.google.com/business-communications/business-messages/resources/release-notes/update-on-gbm)).

The notes found no protocol built for an assistant talking to its owner. The changes of 2025 and
2026 are platform features: Slack's agent APIs, and Telegram's streamed drafts and private-chat
topics.

## Owner identity across channels

Requirement tier 2 asks for one conversation that continues across channels. Hermes keys each
session by platform and chat ID, so it has no identity that spans channels
([Hermes notes](../2.1-notes/hermes.md#channels-and-triggers)). OpenClaw and Letta admit callers by
allowlist and pairing codes ([OpenClaw notes](../2.1-notes/openclaw.md#owner-identity);
[Letta notes](../2.1-notes/letta.md#channels-and-triggers)). An owner record that lists the owner's
ID on each channel, such as a Telegram user ID, a Matrix user ID with its verified device keys, and
a passkey credential ID, lets every adapter resolve a message to the one owner, and the record shows
which channel each approval came from.

## Worth borrowing

- Telegram's `secret_token` header and `initData` signature, which give a signed owner ID on both a
  button press and a Mini App page
- Telegram's streamed draft with a stop button, which maps an owner's interruption to a platform
  event
- matrix-rust-sdk's verified state on each decrypted event, as a sender check that survives a
  compromised server token
- a WebAuthn challenge derived from the proposal ID and action hash, so the signature covers one
  action
- Signal's poll votes and reactions, which name the exact message they answer
- Slack's 5-minute window on signed requests, applied to every webhook channel
- `isAuthenticationRequired` on a native notification action, so a lock-screen press needs an unlock

## Worth avoiding

- the WhatsApp Business Platform, whose terms prohibit a primary AI assistant
- unofficial WhatsApp and iMessage clients, whose terms or setup put the owner's own account at risk
- SMS or a caller's number as the identity behind an approval
- email links that act on GET, which a link scanner can trigger
- ntfy `http` actions or any bearer-only callback as proof of the owner
- per-channel sessions with no owner record, as in Hermes

## Recommendations

- **Use Telegram as the first channel, if the owner accepts Telegram holding the conversation
  text.** It meets every tier 1 need with the least work: signed callbacks, a 64-byte payload for
  the proposal ID, streamed drafts with stop, and push after one `/start`. The trade-off is the
  principle "Owner data stays home": the conversation rests on Telegram's servers, and a compromised
  Telegram account can press approval buttons.
- **Serve approvals for the always-ask set and the digest sheet on a page nixie hosts, behind a
  passkey.** The page can open from a Telegram Mini App, a web push, or a Matrix link, so it works
  with whichever chat channel the owner picks. The trade-off is an extra tap and a passkey prompt on
  the highest-risk approvals, against a proof that no chat account compromise can forge.
- **Keep Matrix on a self-hosted server as the privacy option.** It keeps messages home and gives
  the strongest sender check, but approvals need reactions or the hosted page, and streaming through
  edits hits Synapse's default rate limit.
- **Treat email and SMS as push-only channels.** They can carry a notice and a link to the approval
  page, never an approval on their own.
- **Leave WhatsApp, iMessage and Signal out of tier 1.** WhatsApp's terms prohibit the use, iMessage
  needs a Mac bridge without signed webhooks, and Signal has no buttons and an unclear position on
  bots.
- **Keep one owner record across channels from the start,** since requirement tier 1 marks owner
  identity per channel with ★.

## Open questions

- Does the owner accept Telegram holding conversation text, given the principle "Owner data stays
  home"? If not, the first channel is self-hosted Matrix or a first-party client, and approvals move
  to the hosted page.
- Should a Telegram button press count as an approval for every effect, or only below a risk level,
  with the passkey page for the rest?
- How does nixie show the structured details of a proposal in a 64-byte button flow? A Telegram
  message can carry the details as text, and a Mini App can render the snapshot.
- Does Telegram's `initData` check survive a replayed Mini App URL? `auth_date` bounds the age, and
  the single-use rule from 0006 stops a second use; a spike would confirm the round trip.
- Can Slack's agent features run on a free workspace, given that Slack says some need a paid plan?
- Spike: a Telegram approval round trip. Post a proposal with an inline button and a Mini App link,
  press each from the owner's account and from a second account, and check `from.id`, the
  `secret_token` header, the `initData` hash, `auth_date` and the single-use rule. About half a day.
- Spike: web push to an installed iOS web app that opens a passkey approval page bound to one
  proposal hash. About 1 day, plus a device.
