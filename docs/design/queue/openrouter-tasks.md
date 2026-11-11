# Tasks on OpenRouter models outside Claude

This doc covers how a task runs on an OpenRouter model that is not a Claude model. The agent starts
such a task with a `task.start` call that holds a model name from `models.selectable`. The design
has 2 goals: the model sees only nixie's prompt, and, with a provider pin, its prompt cache sits on
one upstream provider. The task runs on the Agent SDK harness: an OpenRouter model is a model
profile on `harness: agent-sdk`, and the harness's guest changes each request before the request
goes out of the sandbox.

The shapes and the exact refusal texts are in the sketch files under `sketches/harnesses/`, and this
doc holds the rules. Terms that this doc does not define are in
[model harnesses](model-harnesses.md#terms) and the [glossary](../../glossary.md). An item marked
`(open: <name>)` is not settled: see [the open list](open/harnesses.md).

## Terms

- **Counting proxy.** nixie's own HTTP proxy for model requests, which checks the model of each
  request and counts the tokens of each reply.
- **Conversation guest.** The guest of the Agent SDK harness. It runs the turns of the conversation
  and of each task on that harness.
- **Profile outside Claude.** A model profile that states `outside_claude: true`. Its model is not a
  Claude model.
- **CLI blocks.** The 2 system blocks that the Agent SDK's CLI puts ahead of nixie's system prompt
  in every request: a billing header block and an identity line.
- **Request rewriter.** A loopback listener in the conversation guest. It takes each request of the
  CLI, removes the CLI blocks and sends the request on.
- **Provider pin.** The name of the one upstream provider that an aggregator, such as OpenRouter,
  sends a profile's requests to. The config key is `provider_pin`.
- **Provider order.** The body field that an aggregator reads a provider pin from.
- **Side call.** A request that the CLI sends for its own background work, on a small model, with a
  system prompt that is not nixie's.

## Built

This section states what the code does. Each section after it states the design.

- The CLI puts the CLI blocks into the system prompt of every request, ahead of nixie's prompt. A
  model outside Claude reads the identity line as the first words of its persona.
- The conversation guest passes the system prompt to the CLI whole, as a custom prompt, in
  `buildQueryOptions`. The same function sets `ANTHROPIC_BASE_URL` to the profile's base URL, passes
  on the sandbox's proxy variables, and sets a small model for the CLI's side calls.
- The Agent SDK profile schema parses `provider_pin` into `providerPin`. Only the schema, the
  profile type and test utils read it.
- The counting proxy holds its own route config of `api`, `upstream`, `model` and `prices`. It
  forwards each body as it came. A profile's requests go through the proxy only when the profile's
  `base_url` is the URL of a proxy route.
- The profile schema refuses a `context_tokens` above the window that `getCLIContextWindow` returns
  for the model. That window is 200,000 tokens for a model outside the CLI's catalogue.
- In `runTurn`, the guest waits for 2 things at the same time, the CLI's next message and a failure,
  and stops at whichever comes first. When `runConversationGuest` throws, the guest sends a `failed`
  frame with the reason `error`.
- `buildModelFailure` returns no failure for the CLI's `invalid_request` error, so the guest sends
  no `failed` frame for one. A 400 from the rewriter reaches the CLI as such an error.
- `findKeptSandbox` reuses a sandbox only when its whole spec equals the wanted spec. The spec holds
  the guest image.
- The SDK contract suite holds its model as a constant in `buildProbeOptions`.

## The profile

The profile is the one statement of the outside-Claude mark and of the provider pin. Usage:
[a profile outside Claude](sketches/harnesses/01-usage.ts), section B. Shape:
[the 2 config keys](sketches/harnesses/02-types.ts), section K. Texts:
[the load refusals](sketches/harnesses/02-types.ts), section L.

- `outside_claude` is an optional boolean on an `agent-sdk` profile. nixie parses it into
  `outsideClaude` on `AgentSDKProfile`, beside `providerPin`.
- When a profile states no `outside_claude` and its `model` does not contain `claude`, nixie refuses
  the config at its load. Without the mark, the guest would send the CLI's identity line to a model
  outside Claude. (open: missing mark refusal)
- A profile that states `outside_claude: false` loads, whatever its model ID. The guest then runs no
  rewriter for it.
- nixie never derives the mark from the model ID. The model ID only triggers the refusal of a
  profile with no mark.
- When a profile states `provider_pin` without `outside_claude: true`, nixie refuses the config at
  its load. nixie never changes the body of a Claude request, not even for the pin alone.
- The checker runs on the profile of `roles.checker`, or on the profile of `roles.conversation` when
  `roles.checker` is absent. When that profile is outside Claude, nixie refuses the config at its
  load, because the guest's `check` entry runs no rewriter.
- The counting proxy's config holds no key for the mark or the pin.
- Nobody has verified that the CLI takes a prompt above 200,000 tokens for a model outside its
  catalogue. Until then, nixie refuses a `context_tokens` above 200,000 for such a model. (open:
  long prompt probe)

## What the turn frame carries

- The `agent-sdk` member of the turn profile union holds `requestRewrite`. The `turn` frame and the
  `summarize` frame carry it. Shape: [the turn profile union](sketches/harnesses/02-types.ts),
  section C.
- `requestRewrite` is null for every profile that is not outside Claude. For a profile outside
  Claude it is an object that holds the provider pin, or a null pin.
- The Agent SDK harness's `toTurnProfile` sets `requestRewrite` from the profile's `outsideClaude`
  and `providerPin`. Which type holds that function at build time is not settled. (open: openrouter
  harness record)
- The design never adds a guest frame, a `failed` reason, a record kind, a tool or an API procedure.

## The request rewriter

The conversation guest holds the rewriter in 3 files, and none of them imports the Agent SDK. (open:
request change place) Shape: [the 3 guest functions](sketches/harnesses/02-types.ts), section K.
Flow: [the request rewriter](sketches/harnesses/03-flow.ts), section E.

When it starts:

- For a frame whose `requestRewrite` is null, the guest starts no listener, and the CLI gets the
  profile's base URL. The request of a Claude profile reaches upstream byte for byte.
- For a frame with a `requestRewrite`, the guest starts the rewriter on loopback, and then starts
  the CLI. The CLI's `ANTHROPIC_BASE_URL` is the rewriter's URL, and the guest adds `127.0.0.1` to
  `NO_PROXY`.
- After the CLI exits, the guest stops the rewriter.

What it does to a request:

| Request from the CLI | What the rewriter does                                      |
| -------------------- | ----------------------------------------------------------- |
| `POST` messages      | Removes the CLI blocks, adds the provider order, then sends |
| `POST` token count   | Removes the CLI blocks, then sends                          |
| `GET` the model list | Sends it as it came                                         |
| Any other request    | Refuses it                                                  |

- The rewriter holds no list of the CLI's wordings. It takes nixie's system prompt from the frame.
  It looks for the run of blocks at the end of the request's `system` list whose joined text equals
  that prompt, and drops every block ahead of the run. Nobody has verified how the CLI splits the
  prompt into blocks. (open: system blocks probe)
- The rewriter sends the blocks that it does not drop as they came, each with its cache marker.
- The rewriter adds the provider order only when the pin is not null, and only to a messages
  request. (open: provider order field)

Where it sends a request:

- The URL is the frame's `baseURL`, then the path and the query that the CLI sent. The frame's
  `baseURL` is the profile's `base_url`, with a capture tag after it when
  [the turn-input log](turn-input-log.md) captures the step.
- The rewriter sends the whole `baseURL`, path included. On a counting proxy route, that path is the
  route ID, then the capture tag.
- The rewriter's request goes out of the sandbox the way the CLI's own request does. So the
  sandbox's credential broker, which is not the counting proxy, adds the model credential.
- The design is the same with the counting proxy on the model route and without it. Without it, the
  `baseURL` is the model endpoint. With it, the proxy checks the model, forwards the body that it
  received and counts the reply.

The rewriter of one turn or of one summary has 4 states:

| State     | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `none`    | A null `requestRewrite`: nothing listens                                 |
| `open`    | The rewriter takes requests                                              |
| `refused` | The first refusal stands, and the rewriter refuses each request after it |
| `closed`  | The CLI exited                                                           |

## When the rewriter refuses a request

The rewriter sends a request on only when it can show that the CLI blocks are gone. It refuses every
other request. The turn then fails, and the request never reaches upstream. Texts:
[the rewriter's refusals](sketches/harnesses/02-types.ts), section L.

The rewriter refuses:

- a body that is not JSON;
- a body whose `system` is a string, is missing, or holds a block that is not text;
- a body whose `system` list does not end in nixie's system prompt;
- a request that is not a messages request, a token count or the model list.

What a refusal does:

- The rewriter sends the CLI a 400 in the Messages error shape and sends nothing upstream.
- The guest waits for the rewriter's first refusal at the same time as the CLI's next message. On a
  refusal the guest throws, and then sends `failed` with the reason `error` and the refusal's text
  as its detail.
- A refused summary ends with `failed`, and never with `summarized`.
- When the listener cannot bind, the guest sends `failed` with the bind error, and never starts the
  CLI.
- When upstream fails or refuses, the rewriter passes the response on, and the CLI handles it as it
  does without a rewriter.

Two cases that follow from the rules:

- An Agent SDK release that rewords the identity line changes nothing, because the rewriter matches
  nixie's prompt and never the CLI's words. A release that puts a block after nixie's prompt makes
  the rewriter refuse every request.
- A side call holds a system prompt that is not nixie's, so the rewriter refuses it, and that
  refusal fails the turn. Nobody has verified whether the CLI sends a side call on a turn. If it
  does, the design does not work as written. (open: system blocks probe)

## Rules for a model and its checks

- You list a model in `models.selectable` only after 2 checks on that model pass: the SDK contract
  suite against the model, and one task on a preview deployment. nixie's code checks neither.
  [The slices](slices/harnesses.md) hold the commands of both.
- Each model needs its own checks, because OpenRouter gives no promise for it. OpenRouter's docs
  promise that its Messages endpoint works with the Agent SDK's CLI only for the models of its
  Anthropic provider.
- The SDK contract suite reads its model and its base URL from `NIXIE_SDK_CONTRACT_MODEL` and
  `NIXIE_SDK_CONTRACT_BASE_URL`.
- The counting proxy counts and checks the model of a request outside Claude as it does for any
  request.
- The task report and the record that ends a task run are the same on every profile.
- nixie never reuses a started task's sandbox whose spec holds the guest image of another release.
  So a guest gets a frame with `requestRewrite` only from a host of its own release.
- A check never sends a turn to a production deployment.

## Not in scope

- A harness of its own for OpenRouter.
- OpenAI models on OpenAI's own API. [The Codex harness](codex-harness.md) covers them.
- The `conversation` role and the memory roles on a profile outside Claude. This doc designs only
  the `task` role on such a profile, and adds no refusal for the other roles.
- A rewrite in the counting proxy, and a mark on a proxy route.
- A proxy config generated from the deployment's config.
- A fix for a side call. The open list states who chooses the fix.
- A check that needs the production deployment's config.
