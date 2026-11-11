# The turn-input log: capture, and a secret in a request

The turn-input log stores the exact body of each model request, so that you can open what a model
received: the system prompt, the reminders that the harness added, every message and the tool list.
It exists for tuning recent prompts. This doc covers how nixie captures a request, and what nixie
does with a request that holds a secret. The secret rules are here because nixie applies them during
the capture, where it decides whether to store a request at all.
[The turn-input store](turn-input-store.md) covers the records, the files, removal, a forget,
reading and faults.

The shapes are in the sketch files under `sketches/harnesses/`, and this doc holds the rules. Terms
that this doc does not define are in [model harnesses](model-harnesses.md#terms) and the
[glossary](../../glossary.md). An item marked `(open: <name>)` is not settled: see
[the open list](open/harnesses.md).

## Terms

- **Counting proxy.** nixie's own HTTP proxy for model requests. It checks the model of each request
  and counts the tokens of each reply. It is a separate program from the nixie server and holds no
  secret of the deployment.
- **Proxy route.** One upstream model API in the counting proxy's config. The first segment of a
  request's path is the ID of its route.
- **Step.** One attempt of a task or of the conversation to run a model turn. Its ID is the
  `stepRunID`.
- **Sealed.** Encrypted so that only the holder of one key can read it.
- **Logged request.** The body of one model request, stored sealed. A turn makes one request per
  model call, and each request repeats the whole context. So the log holds one logged request per
  model call.
- **Capture.** One record pair, opened and closed, under which nixie collects the requests of one
  step. A capture has a capture ID and a key pair.
- **Capture point.** A counting proxy that copies requests. Each entry in the config key `sources`
  is one capture point.
- **Capture tag.** One path segment in a turn frame's base URL. It holds the capture ID and the
  capture's public key.
- **Spool.** The folder in which the counting proxy writes each sealed body.
- **Intake.** nixie's read of one spool file into the store.
- **Miss.** A `model.input_missed` record. It holds a reason and the count of requests that the log
  does not hold.
- **Own secret value.** A secret that the deployment itself holds, such as a credential in nixie's
  secrets file. Any other secret in a request came into the session from outside, such as an API key
  in a URL.

## Built

This section states what the code does. Each section after it states the design.

- The event log holds the model's output and the totals of each turn. It holds neither the rendered
  system prompt, the input messages as sent, nor the tool list.
- The host renders the system prompt and the input messages. The harness builds the request inside
  the sandbox, where the model runtime adds system blocks, reminders and the tool list. So the body
  on its way to the model API is the exact input, and the host's turn frame is not.
- The counting proxy returns 403 for a path that matches no endpoint of its route's API. It forwards
  each body as it came. A profile's requests pass the proxy only when the profile's `base_url` is
  the URL of a proxy route.
- A guest sends one `call` frame for each model call whose stream completed.

## Where nixie copies a request

- The counting proxy copies each request, for every harness and for both model APIs,
  `anthropic-messages` and `openai-responses`. A copy made by a guest would let each guest vouch for
  its own input. (open: capture and store)
- A logged request equals, byte for byte, the body that the model API received. Its record holds its
  conversation or task, its step and its place among the step's requests.
- The proxy never changes a body. For a model that is not a Claude model, the guest changes each
  request before the request reaches the proxy
  ([the request rewriter](openrouter-tasks.md#the-request-rewriter)). The proxy copies the changed
  bytes, which are the bytes that the model receives.
- The proxy seals each copy to the capture's public key. Only nixie holds the private key, so the
  proxy's disk never holds a readable body.
- The log never holds the credential of a request, or an auth header.
- nixie and the proxy never write text of a request to a server log.
- Every readable copy of a request is on the host that runs nixie, which you control.
- nixie captures a profile's requests only when the profile's `base_url` starts with the `base_url`
  of an entry in `sources`. An entry in `sources` is one counting proxy and its spool. A profile
  whose `base_url` is the model endpoint itself matches no entry. (open: production routing)

## The switch and the roles

Your commands are in [the usage sketch](sketches/harnesses/01-usage.ts), section D, and the config
is in section E. The types of the config keys are in
[the types sketch](sketches/harnesses/02-types.ts), section M.

- With no `turn_input_log` section in the config, the log is off.
- With `default: always`, the log is on. With `default: off`, the log is off until you run
  `nixie turn-input on`. (open: log default)
- `nixie turn-input on` holds until you run `off`. With `--for`, it holds for a set time of at most
  `max_window`.
- nixie captures the steps of the model roles in `roles`. (open: log roles)
- A compaction's `summarize` frame counts under the `conversation` role.
- The checker's request is a step of the `checker` role, so nixie captures it only when `checker` is
  in `roles`.
- When the log is off, or the step's role is outside `roles`, nixie stores nothing, and the turn
  frame's base URL is the profile's own.
- When the step's profile matches no entry in `sources`, nixie stores no request and writes one miss
  with the reason `no_capture_point`. No program outside the sandbox sees what that guest sent.

## A capture, from a step's start to its end

The module `turn-inputs` owns the log. The sessions module asks it for a capture at a step's start,
and has no other part in the log. The flow is in [the flow sketch](sketches/harnesses/03-flow.ts),
section F, and an example of a tagged URL is in [the usage sketch](sketches/harnesses/01-usage.ts),
section F.

1. nixie creates a capture ID, which is a random UUID, and a P-256 key pair.
2. nixie makes a fresh key in `keys.db`, seals the private key under it, and commits
   `model.input_capture_opened` with the sealed private key.
3. nixie appends the capture tag to the base URL in the turn frame, after the route ID. The tag
   holds no secret. (open: capture tag layout)
4. The model runtime sends its requests under the tagged base URL. The guest has no code for the
   tag, and the frame schema has no key for it. (open: base URL path probe)
5. The proxy removes the tag from the path, and then matches the endpoint.
6. For a tagged request to `messages` or `responses`, the proxy seals the body that it sends
   upstream and writes it to a `.part` file in the spool.
7. When the model API returns a response, with any status, the proxy renames the file to `.cap`.
8. While the capture is open, nixie reads the spool once a second and runs intake on each `.cap`
   file of the capture.
9. When the step ends, nixie closes the capture.

Rules for the proxy:

- The copy holds the body only, and never a header of the request.
- The proxy never awaits the spool write, so the reply never waits for it.
- When the model API returns no response, the proxy removes the `.part` file. So the log never holds
  a body that the model API did not receive.
- When the proxy cannot write a body, it writes a `.miss` file with one of 3 reasons: `spool_full`,
  `spool_write_failed` or `seal_failed`.
- At its start, the proxy removes every `.part` file in the spool, because its last process left
  each one unfinished.
- With no `capture` key in its config, the proxy removes a tag and writes no file.

## The spool file

The tag and the header types are in [the types sketch](sketches/harnesses/02-types.ts), section N.

- The wire library holds the tag and the spool header, because the proxy writes them and nixie reads
  them. A committed fixture per header version sits beside them.
- A spool file's name holds the capture ID, the proxy's writer ID and a counter. The writer ID is
  random per start of the proxy, and the counter rises by one per written request.
- A spool file is a 4-byte header length, the header as JSON, then AES-256-GCM ciphertext.
- The proxy makes an ephemeral key pair per request and puts its public key in the header. It
  derives the cipher's key from the ephemeral key and the tag's public key. The additional data is
  the capture ID, the writer ID and the counter.
- The header holds the SHA-256 of the plain body. nixie checks the body against the hash at intake,
  and never stores the hash.

## Intake

1. nixie opens the body with the capture's private key.
2. nixie checks the body's length and SHA-256 against the header.
3. nixie searches the body for an own secret value, by
   [the secret rules](#a-request-that-holds-a-secret).
4. nixie seals the body under a fresh key of the request's own, and writes it as one file in the
   data directory.
5. nixie commits `model.input_logged` and removes the spool file.

- The `call` key of `model.input_logged` is the file's place among the capture's files, ordered by
  writer ID and counter.
- The `isRewritten` key of `model.input_logged` is true when the step's profile states
  `outside_claude: true`. nixie sets it from the profile, because the proxy cannot tell a changed
  body.
- For a `.miss` file, nixie writes one miss with the proxy's reason.
- When intake of a file fails, nixie tries the file again at its next read of the spool. After 5
  failures in a row, nixie writes one miss with the reason `intake_failed` and removes the file.

## The close and its count check

nixie closes a capture in 3 steps, in this order:

1. nixie waits until the spool holds no `.part` file of the capture, for at most `close_wait`.
2. nixie runs intake on every `.cap` file and every `.miss` file of the capture.
3. nixie destroys the capture's key in `keys.db`, so that nobody can read the private key, and
   commits `model.input_capture_closed`.

[The fault table](turn-input-store.md#faults) covers a `.part` file that outlasts `close_wait`.

Then nixie compares 2 counts: the logged plus missed requests of the capture, and the `call` frames
of the step.

- When the first count is below the second, nixie writes one miss with the reason `not_received` and
  the gap as its `count`. `nixie turn-input list` shows the miss. A model runtime that dropped the
  tag, or a spool folder set wrong, shows this way.
- When the first count is above the second, nixie writes nothing. The proxy copies a refused call
  and a retried call, and the guest sends no `call` frame for either.
- An equal count proves that nixie lost no request only on a step with no refused and no retried
  call. On any other step, the extra file of a refused call can hide a lost one.

## A request that holds a secret

A request holds every message of the session, each tool call's input and each tool result. So a
secret that reached the session is in every request from that point, until a compaction or the
session's end takes the text out. The type of the search option is in
[the types sketch](sketches/harnesses/02-types.ts), section Q. (open: secret in a request)

- nixie stores a request that holds a secret as it stores any request. The one exception is a
  request that holds an own secret value.
- In step 3 of intake, nixie searches the body for each own secret value, in its plain form and in
  its JSON-escaped form.
- On a match, nixie stores no body, writes one miss with the reason `holds_own_value`, and removes
  the spool file. So a logged request is exact, or nixie holds none.
- The server builds the search and passes it to the module as `holdsOwnValue`. The values come from
  `collectOwnValues`, which [the secret URL refusal](secret-url-refusal.md) of the fetch tool
  shares.
- [The config keys](secret-url-refusal.md#the-config-keys) of that refusal own which values
  `collectOwnValues` returns and the shortest value it returns. With a config schema that lacks the
  2 keys, `collectOwnValues` uses the defaults of those keys.
- The proxy never gets an own secret value.
- Each request of the session after the match holds the same text. So nixie stores no request of
  that session until the text is out of the session's context, and writes one miss per request.
- The proxy never masks a body and never drops a tool call from one. Either would break the
  byte-for-byte rule.
- nixie never searches a request for the pattern of a kind of secret, such as an API key format. The
  fetch tool applies such patterns, to a URL only.

| Case                                                                  | What nixie does                        | Record                              |
| --------------------------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| The model asks for a URL with a key in it, and the fetch tool refuses | Stores the next request whole          | `model.input_logged`                |
| Your own message holds such a URL, so the fetch tool fetches it       | Stores the next request whole          | `model.input_logged`                |
| A URL, a message or a tool result holds an own secret value           | Stores no body for each such request   | A miss with `holds_own_value`       |
| The fetch tool refuses a redirect hop                                 | Stores the request whole               | `model.input_logged`                |
| A page or a tool result holds a key                                   | Stores the request whole               | `model.input_logged`                |
| You forget the message that held the secret                           | Removes each request the forget covers | `model.input_removed` with `forget` |
| The search throws on 5 tries of intake                                | Stores no body                         | A miss with `intake_failed`         |

- In the first 2 rows, the next request holds the URL in its tool-use block.
- The URL of a refused hop never enters a request. The refusal sentence holds the rule's name and
  the sending host only.
- When nixie stops after the `holds_own_value` miss and before it removes the spool file, the next
  intake finds the file and writes a second miss. The count of misses is then one high.

## Not in scope

- The model's output, which the event log holds.
- A view in the web UI, and any device API procedure.
- A speech provider's input. nixie captures only the model roles of `roles`, and a speech layer has
  no model role.
- A copy made in the sandbox, in the credential broker, or as a record attachment.
- A post from the proxy to nixie, a body in `nixie.db`, and a plain spool file.
- An interface for a second kind of capture point.
