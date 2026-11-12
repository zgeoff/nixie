# The turn-input log

- **Status:** draft, a proposal. Both work items are blocked on the question below. This is a
  security design: the shape the owner chooses gets an independent review before it is built.
- **Work items:** the capture in the counting proxy, the turn-input log in nixie

**The question for the owner:** where does the log capture and store a request? The options are a
spool that the counting proxy seals to a key per step, with body files outside the backup set; a
post from the proxy to a sink that nixie serves; or a plain spool with rows in the database. This
doc proposes the sealed spool. A copy made by a guest would let each guest vouch for its own input,
so every option copies in the proxy.

The log stores the exact body of each model request, so you can open what a model received: the
system prompt, the reminders the harness added, every message and the tool list. It exists for
tuning recent prompts. The event log never holds that input: the harness builds each request inside
the sandbox.

- **Step.** One attempt of a task or of the conversation to run a model turn, with the ID
  `stepRunID`.
- **Capture.** The window in which nixie collects one step's requests, with a capture ID and a P-256
  key pair.
- **Capture point.** A counting proxy and its own spool folder: one entry of the config key
  `sources`.
- **Capture tag.** One path segment in a turn frame's base URL that holds the capture ID and the
  capture's public key, and no secret.
- **Miss.** A row that holds a reason and the count of requests the log does not hold.
- **Own secret value.** A secret that the deployment itself holds, such as a credential in nixie's
  secrets file.

## Shape

```mermaid
flowchart LR
  step[step start] -->|openCapture| mod[turn-inputs module]
  mod -->|"base URL with the tag"| guest[guest and model runtime]
  guest -->|request| proxy[counting proxy]
  proxy -->|"body, untagged"| api[model API]
  proxy -->|"sealed .cap file"| spool
  spool -->|"intake, once a second"| store["turn-inputs folder, keys.db, tables"]
  host[nixie turn-input open] -->|"model.input_opened"| store
```

## Contracts

These hold under any choice of the question above: the tag, the config switch, `openCapture`, the
host procedures and the commands. The spool file and the 3 key layers are the proposal.

### The tag and `openCapture`

```text
The profile's base URL:     https://<proxy_host>/<route>
The turn frame's base URL:  https://<proxy_host>/<route>/~in.<tag>
The CLI's request:          POST https://<proxy_host>/<route>/~in.<tag>/v1/messages
What the proxy matches:     /<route>/v1/messages
```

```ts
// turn-inputs module. The sessions module opens a capture at a step's start and closes it at the
// step's end, and has no other part in the log.
const capture = await openCapture({ step, profile, role: 'task' });
// → { baseURL: 'https://<proxy_host>/<route>/~in.<tag>', close }, or the profile's own base URL
await capture.close({ callFrames: 3 }); // the step's `call` frames

interface OpenCaptureInput {
  readonly step: { readonly taskID: string; readonly stepRunID: string };
  readonly profile: ModelProfile;
  readonly role: ModelRole;
}
interface Capture {
  readonly baseURL: string;
  readonly close: (step: { readonly callFrames: number }) => Promise<void>; // a no-op with no capture
}
export declare function openCapture(input: OpenCaptureInput): Promise<Capture>;

// The server builds the search from collectOwnValues and passes it to the module.
interface TurnInputsOptions {
  readonly holdsOwnValue: (body: Uint8Array) => boolean;
}
```

```yaml
# nixie's config. With no `turn_input_log` section, the log is off.
turn_input_log:
  default: off # off | always
  max_window: 24h # the longest time one `on --for` lasts
  close_wait: 5s # the longest a step's end waits for the proxy's .part files
  roles: [conversation, task]
  retention: { days: 7, bytes: 2147483648 } # days: 3 | 7 | 30
  on_forget: threads # threads | since_item | keep
  sources:
    proxy:
      base_url: https://<proxy_host>
      dir: /var/lib/nixie/turn-input-spool # this proxy's own `capture.spool`
```

### The spool file (proposal)

```ts
// wire library: the proxy writes these and nixie reads them. Committed fixtures pin each version.
export interface CaptureTag {
  readonly captureID: string; // a random UUID
  readonly sealTo: Uint8Array; // the capture's P-256 public key
}
export declare function encodeCaptureTag(tag: CaptureTag): string; // the segment after `~in.`
export declare function decodeCaptureTag(segment: string): CaptureTag | null;

// <spool>/<captureID>.<writer>.<counter>.part, renamed to <…>.<upstreamStatus>.cap on a response.
// Bytes: a 4-byte header length, the header as JSON, then AES-256-GCM ciphertext.
export interface SpoolHeader {
  readonly version: 1;
  readonly captureID: string;
  readonly writer: string; // random per start of the proxy
  readonly counter: number; // from 1 per (capture, writer), one per tagged request sent upstream
  readonly receivedAt: number;
  readonly route: string;
  readonly api: ModelAPI; // the matched route's `api`
  readonly endpoint: 'messages' | 'responses';
  readonly bytes: number;
  readonly sha256: string; // of the plain body; checked at intake and stored nowhere
  readonly ephemeralKey: string; // base64url, this request's own P-256 public key
  readonly iv: string; // base64url
}
// The wire library owns the seal and the open, and its fixture pins the derivation: ECDH on
// P-256, HKDF-SHA-256 to the AES key, the additional data (captureID, writer, counter).
export declare function sealSpoolBody(
  tag: CaptureTag,
  header: Omit<SpoolHeader, 'ephemeralKey' | 'iv'>,
  body: Uint8Array,
): Uint8Array;
export declare function openSpoolFile(
  file: Uint8Array,
  privateKey: CryptoKey,
): { header: SpoolHeader; body: Uint8Array } | null;

// <spool>/<captureID>.<writer>.<counter>.miss: plain JSON, no body. It takes a counter value.
export interface SpoolMiss {
  readonly version: 1;
  readonly captureID: string;
  readonly writer: string;
  readonly counter: number;
  readonly reason: 'spool_full' | 'spool_write_failed' | 'seal_failed';
}
```

```yaml
# the counting proxy's config. With no `capture` key, the proxy removes a tag and writes no file.
capture:
  spool: /var/lib/nixie/turn-input-spool
  max_bytes: 536870912
```

### The store and its records

```text
<data directory>/turn-inputs/<inputID>.bin   a 12-byte IV, then the body's ciphertext; the additional
                                             data is the key ID and the input ID
keys.db                                      one key per logged request, and one per open capture
nixie.db turn_inputs                         one row per request: its capture, step, call place,
                                             role, profile, model, harness, api, endpoint, route,
                                             isRewritten, upstream status, bytes, key ID, the event
                                             log's sequence at intake, state, removed cause
nixie.db turn_input_captures                 one row per capture: step, role, source, key ID, the
                                             sealed private key, state, close cause, counts
nixie.db turn_input_misses                   one row per miss: capture, step, reason, count
```

The event log holds only what an audit needs:

```ts
// turn-inputs module. Neither payload holds a request's text.
interface InputLogSet {
  state: 'on' | 'off';
  until: number | null;
} // model.input_log_set
interface InputOpened {
  inputID: string;
  by: 'host';
} // model.input_opened
```

### Reading

```ts
// contract library, hostContract, on the control socket. The device API's contract holds none.
turnInputs: {
  // newest first: each request's row and each miss. Not an opening.
  list: oc.input(z.strictObject({ limit: z.int().positive().max(500).default(50) }))
    .output(z.object({ inputs: z.array(loggedInputSchema), misses: z.array(inputMissSchema) })),
  // OPEN_NOT_RECORDED: the model.input_opened commit failed, so no body
  open: oc.errors({ NOT_FOUND: { status: 404 }, REMOVED: { status: 410 }, OPEN_NOT_RECORDED: { status: 503 } })
    .input(z.strictObject({ inputID: z.string().min(1) }))
    .output(z.object({ inputID: z.string(), body: z.string() })),
  set: oc.input(z.discriminatedUnion('state', [
      z.strictObject({ state: z.literal('on'), forMs: z.int().positive().nullable() }),
      z.strictObject({ state: z.literal('off'), drop: z.boolean() }),
    ])).output(z.object({ state: z.enum(['on', 'off']), until: z.number().nullable() })),
}
```

```bash
nixie turn-input on [--for <duration>]   # until `off`, or for at most max_window
nixie turn-input off [--drop]            # --drop also removes every logged request
nixie turn-input list [--limit <count>]
nixie turn-input open <input_id>         # prints the body
```

## Constraints

### The capture

- A logged request equals, byte for byte, the body that the model API received. The proxy never
  changes a body; for a model outside Claude it copies the bytes the guest's request rewriter sent.
- nixie captures a step only when the log is on, the step's role is in `roles`, and the profile's
  `base_url` starts with a `sources` entry's `base_url`. A compaction's `summarize` frame counts
  under `conversation`. With the log off or the role outside `roles`, nixie stores nothing and the
  base URL is the profile's own; with no matching source, it writes one `no_capture_point` miss.
- With `default: always`, the log starts on. `--for` holds it on for at most `max_window`.
- The guest has no code for the tag, and the frame schema has no key for it. The proxy removes the
  tag, then matches the endpoint, and its model check and count are as without a tag.
- The proxy copies a tagged request only when it sends it upstream to `messages` or `responses`. A
  request that the proxy refuses writes no file.
- The proxy never awaits the spool write. When the model API returns no response, it removes the
  `.part` file. At its start, it removes every `.part` file in its own spool, so 2 proxies never
  share a folder.
- When the proxy cannot write a body, it writes a `.miss` file: `spool_full` when the spool holds
  `max_bytes`, `spool_write_failed` or `seal_failed`.
- While a capture is open, nixie reads the spool once a second. At the step's end it waits for the
  capture's `.part` files for at most `close_wait`, takes in every file, destroys the capture's key
  and closes the capture.
- Each writer's counters of a capture run from 1 with no gap. At the close, each gap in a writer's
  sequence is one `not_received` miss. A lost last request leaves no gap, so nixie also writes
  `not_received` for the call frames above the files it holds; a refused or retried call can hide
  that last loss.
- The log never holds a request's credential or a header. No server log holds a byte of a body. The
  proxy's 403 and 404 replies echo the path, tag included, which holds no secret.

### The 3 key layers

| Layer                                                     | It stops, beyond file permissions                                                                                       | Status   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| The proxy seals each body to the capture's public key     | A reader of the spool through a volume snapshot, a mount on another host, or a root on the proxy's host after the write | proposal |
| `keys.db` seals the capture's private key, shred at close | A spool file that arrives after the close stays unreadable; permissions stop nothing more                               | proposal |
| Each body has its own key in `keys.db`                    | A removal deletes the key, so the bytes left on disk, in journals and in any copy of the data directory are unreadable  | needed   |

- The third layer is what makes a forget complete: the built forget is complete only when no stored
  copy shows the forgotten text.

### Intake and a secret

- nixie opens the body with the capture's private key, checks its length and SHA-256, runs
  `holdsOwnValue`, seals the body under a fresh key of its own, writes the file and its row, then
  removes the spool file. A `.miss` file gives one miss with its reason.
- A file that fails its header, its key or its checksum gives `undecodable`; a file of a closed
  capture gives `capture_closed`; 5 failed intakes in a row give `intake_failed`. Each removes the
  file.
- `holdsOwnValue` searches each own secret value in its plain and its JSON-escaped form. The values
  come from `collectOwnValues`, which the web fetch's secret URL refusal shares and whose config
  keys pick the values. The proxy never gets one.
- On a match, nixie stores no body and writes a `holds_own_value` miss, so a logged request is
  exact, or nixie holds none. Each later request of that session gives its own miss until the text
  leaves the context.
- nixie stores any other request that holds a secret as it stores every request. It never masks a
  body, drops a tool call, or searches for a pattern of a kind of secret.

### Removal, retention and a forget

- One function removes a request: it deletes the key and checkpoints the key store, unlinks the
  file, then marks the row removed. Each step is safe to run twice.
- A sweep runs at the start, every 10 minutes and after each intake. It removes requests past
  `retention.days`, then the oldest until the store fits `retention.bytes`.
- A backup set holds `nixie.db` and `keys.db` only, so it never holds a body. After a restore, the
  start marks each row with no file as `missing`.
- `--drop` removes every request with `dropped`. A reset under
  [0046](../../decisions/0046-resetting-the-event-log.md) empties the key store and the tables, and
  deletes the `turn-inputs` folder.

A forget of a memory item removes logged requests in its session cleanup, after it closes the open
captures of the threads it covers. The item's first record is the first record of that memory item
in the event log; a request "after" it holds a later intake sequence. The forget design owns which
threads the cleanup covers.

| `on_forget`  | On a thread the cleanup covers             | On every other thread                      |
| ------------ | ------------------------------------------ | ------------------------------------------ |
| `threads`    | Every request                              | Each request after the item's first record |
| `since_item` | Each request after the item's first record | Each request after the item's first record |
| `keep`       | None                                       | None                                       |

- With `threads`, a covered thread loses every request, because its sessions may have held the
  item's text before the item existed, such as the message it came from. Another thread could hold
  the text only once the item existed, as memory brought into its turns.
- nixie never searches a request for the item's text, because a search misses a paraphrase. With
  `keep`, the forget reports the count it left and the date retention removes the last of them.

### Faults

A fault in the log never fails, delays or changes a model request, and never changes the proxy's
count. A step's end can wait up to `close_wait` for the proxy's `.part` files.

| Fault                                                 | Outcome                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| nixie cannot write the capture's key or its row       | The turn runs with no tag; a log line with a reason code                         |
| The proxy cannot decode a `~in.` segment              | It removes the segment and writes no file; the close counts a miss               |
| The proxy has no `capture` key, or another folder     | No file arrives; the close writes `not_received`                                 |
| A `.part` file outlasts `close_wait`                  | nixie closes without it; the close writes `not_received`                         |
| nixie stops mid-step                                  | Its start closes every open capture; the step opens a new one when it runs again |
| nixie stops between the key, the file and the row     | Its start removes a file with no row and a key with no file                      |
| A tagged request reaches a proxy with no capture code | 403 for an unknown path, and the turn fails                                      |

### What the last release does

- The proxy takes its release first. Before a rollback of the proxy, you turn the log off and remove
  its `capture` key, which the last proxy refuses.
- The last nixie release ignores the folder and the 3 tables. A rollback first runs
  `nixie turn-input off --drop`, then removes the `turn_input_log` section, which its strict schema
  refuses.

## Decisions

- **Every removal deletes the key first.** From that point the file and every backup of the key
  store hold only ciphertext or no key.
- **The event log holds 2 kinds.** The rest is debugging state in tables, so the last release meets
  only 2 unknown kinds.

## Builder decides

- The byte layout inside the tag, as long as it round-trips its fixture.
- The HKDF info string, within the fixture.
- The schemas of a listed request and a miss, from the tables' columns.
- Internal names, the wording of each error, and the layout of the tests.

## Out of scope

- The model's output, which the event log holds, and a speech provider's input.
- A read by nixie itself, a turn that nixie runs from a stored request, a normalised view, a compare
  of 2 requests, and any view on an enrolled device or in the web UI.

## Open questions

- **The question at the top of this doc.** The owner settles it, and an independent review checks
  the chosen shape. Until then, neither item is built.
- **Do the first 2 key layers stay?** The owner settles it with the question above. Until then, the
  proposal keeps them.
- **What does a forget do by default?** The owner settles `on_forget`. Until then, `threads`.
- **How long does the log hold a request?** The owner settles 3, 7 or 30 days, each with a byte
  bound. Until then, 7 days and 2 GiB.
- **Does the log run by default?** The owner settles it: always, off until you turn it on, or on for
  a set time. Until then, `default: off`.
- **Which roles does the log cover?** The owner settles it: `conversation` and `task`, with
  `worker`, with `checker`, or every role. Until then, `conversation` and `task`.
- **What does the log do with a request that holds a secret?** The owner settles it: accept and
  seal, mask the secret before the capture, or drop the tool call; and for an own secret value,
  store no body or narrow the rule. Until then, the rules above.
- **Does production send its model calls through the counting proxy?** The owner settles it. The
  proxy fails closed, so a fault in it stops every turn on a route. Until then, a production profile
  matches no source, and each covered step writes a `no_capture_point` miss.
- **Does each harness's CLI accept a base URL with one more path segment?** A probe settles it per
  harness: the Agent SDK case in the capture item, and the Codex case with the Codex gates. Until
  then, a harness whose probe fails has no captured step.
