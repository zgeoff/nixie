# The turn-input store: records, removal and reading

This doc covers what nixie holds of a logged request after it is stored: its records, its file and
its key, when nixie removes it, how you open it, and what each fault does. A logged request is the
sealed body of one model request. [The turn-input log](turn-input-log.md) covers how nixie captures
a request, and defines the terms that this doc uses: capture, capture tag, spool, intake, miss,
counting proxy, step and own secret value.

The shapes are in the sketch files under `sketches/harnesses/`, and this doc holds the rules. Other
terms are in the [glossary](../../glossary.md). An item marked `(open: <name>)` is not settled: see
[the open list](open/harnesses.md).

## Built

This section states what the code does. Each section after it states the design.

- When you forget a memory item, nixie deletes the key of every session summary on the thread and
  purges every transcript. A forget is complete only when no stored copy shows the forgotten text.
- A backup set is a snapshot of the 2 databases, `nixie.db` and `keys.db`. A backup never holds a
  file outside them.
- The host commands, such as `nixie health`, call the procedures of `hostContract` on the control
  socket. The device API's procedures are in `contract`.

## The records

nixie writes 7 record kinds for the log. Their payloads are in
[the types sketch](sketches/harnesses/02-types.ts), section O.

- A record of the log never holds text of a request, in its payload or in an erasable field.
- Each record's envelope, which is the set of fields that every record has, holds the thread and the
  step key.
- The payload holds `stepRunID`. The tool calls and the task messages of the same step hold the same
  `stepRunID`, so a reader matches them to a logged request.
- `model.input_log_set` records each time the log goes on or off.
- `model.input_capture_opened` and `model.input_capture_closed` mark a capture. nixie closes a
  capture for one of 3 causes: `step_ended`, `forget` or `server_start`.
- `model.input_logged` marks one stored request.
- `model.input_missed` marks a miss. Its `count` is the count of requests that the log does not
  hold.
- `model.input_removed` marks a removal with one of 4 causes: `retention`, `byte_bound`, `forget` or
  `missing`.
- `model.input_opened` marks each opening of a request, with `by: 'host'`.

## The store

The layout is in [the types sketch](sketches/harnesses/02-types.ts), section P.

- Each logged request is one file under `turn-inputs` in the data directory, named by its input ID.
  The file holds a 12-byte IV, then the body's ciphertext. The additional data is the key ID and the
  input ID.
- `keys.db` holds one key per logged request. Every key ID is random. For each open capture, it
  holds one more key, which seals the capture's private key.
- `nixie.db` holds 2 projections of the records: `turn_inputs`, with one row per request, and
  `turn_input_captures`, with one row per capture.
- nixie stores a body as a file, so that a removal frees its bytes on disk. nixie never writes a
  body to `nixie.db`. A backup set holds the 2 databases only, so a backup never holds a body.
- After a restore, the store holds no body. At its start, nixie marks each row with no file as
  removed, with the cause `missing`.

The log has 3 kinds of state:

| Thing     | From      | To        | What moves it                             |
| --------- | --------- | --------- | ----------------------------------------- |
| The log   | `off`     | `on`      | `nixie turn-input on`                     |
| The log   | `on`      | `off`     | `nixie turn-input off`                    |
| The log   | `on`      | `off`     | The end of the time that `--for` set      |
| A capture | `open`    | `closed`  | The step's end                            |
| A capture | `open`    | `closed`  | A forget that covers the capture's thread |
| A capture | `open`    | `closed`  | The server's start                        |
| A request | `spooled` | `logged`  | Intake                                    |
| A request | `spooled` | `missed`  | A fault at intake                         |
| A request | `spooled` | `missed`  | An own secret value in the body           |
| A request | `logged`  | `removed` | A removal                                 |

A request never moves out of `missed` or `removed`. With `default: always` in the config, the log
starts `on`.

## Removal

One function removes a request, for every cause. The flow is in
[the flow sketch](sketches/harnesses/03-flow.ts), section G.

1. The function deletes the request's key and checkpoints the key store, so that the key store's
   files hold no copy of the key.
2. The function unlinks the file.
3. The function commits `model.input_removed`.

- Each of the 3 steps is safe to run twice.
- Every removal deletes the key first. From that point nobody can read the request: the file and
  each backup of the key store hold only ciphertext or no key.

## Retention

- A sweep runs at the server's start, every 10 minutes and after each intake.
- The sweep first removes each request past `retention.days`, with the cause `retention`. (open:
  retention limit)
- The sweep then removes the oldest requests until the store fits `retention.bytes`, with the cause
  `byte_bound`.
- The byte bound exists because a conversation near its context cap repeats that context on each
  model call.

## A forget

When you forget a memory item, nixie removes logged requests as one part of the forget's session
cleanup. nixie picks the requests by the config key `on_forget`. The design of a forget owns which
threads the session cleanup covers. (open: forget and the log)

| `on_forget`  | On a thread that the cleanup covers               | On every other thread                             |
| ------------ | ------------------------------------------------- | ------------------------------------------------- |
| `threads`    | Every logged request                              | Each request logged after the item's first record |
| `since_item` | Each request logged after the item's first record | Each request logged after the item's first record |
| `keep`       | None                                              | None                                              |

- In the table, the item's first record is the first record of the forgotten memory item in the
  event log. nixie compares the log sequence of a request's `model.input_logged` record with the
  sequence of that record. nixie never searches a request for the item's text, because a search
  misses a paraphrase.
- With `keep`, the forget reports the count of requests that it did not remove, and the date on
  which retention removes the last of them.
- The forget first closes the open captures of the threads that the cleanup covers.
- When nixie cannot delete a key, the removal throws. The cleanup is then incomplete, and nixie runs
  it again.
- The removal also covers a thread that has no session to clean, such as a finished task's.
- A reset of the deployment removes every logged request, whatever `on_forget` holds.
- The design does not settle which cause nixie records for a reset, or for the `--drop` flag of
  [Reading](#reading). (open: drop and reset cause)

## Reading

Only you open a logged request, through the host commands. Your commands are in
[the usage sketch](sketches/harnesses/01-usage.ts), section D, and the procedures are in
[the types sketch](sketches/harnesses/02-types.ts), section Q. (open: turnInputs procedures)

- `hostContract` holds 3 procedures: `turnInputs.list`, `turnInputs.open` and `turnInputs.set`. Only
  the host commands call them, on the control socket.
- The device API's `contract` holds no procedure of the log, and the web UI holds no view of it.
- `turnInputs.list` returns the envelope fields of each logged request, and each miss. nixie writes
  no `model.input_opened` for it.
- `turnInputs.open` commits `model.input_opened` and then reads the file. When that commit fails, it
  returns no body.
- `turnInputs.set` turns the log on or off and commits `model.input_log_set`.
- `nixie turn-input off --drop` turns the log off and removes every logged request, through
  `turnInputs.set`.

## Faults

A fault in the log never fails, delays or changes a model request, and never changes the token count
of the counting proxy. One case is outside this rule: a tagged request reaches a counting proxy of a
release that has no capture code. That proxy reads the tag as part of the endpoint path, finds no
such endpoint and returns 403, and the turn fails.

| Fault                                                           | Outcome                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| nixie cannot write the capture's key or its record              | The turn runs with no tag                               |
| The proxy's config has no `capture` key                         | The proxy removes the tag and writes no file            |
| The proxy's `spool` is not the `dir` of nixie's `sources` entry | nixie finds no file of the capture                      |
| The spool is at `max_bytes`                                     | A `.miss` file, then a miss with `spool_full`           |
| The proxy fails to write a spool file                           | A `.miss` file, then a miss with `spool_write_failed`   |
| The proxy fails to seal a body                                  | A `.miss` file, then a miss with `seal_failed`          |
| The model API returns no response                               | The proxy removes the `.part` file                      |
| The proxy stops with a `.part` file on disk                     | The proxy's next start removes the file                 |
| A `.part` file is in the spool past `close_wait`                | nixie closes the capture without the file               |
| A spool file fails its header, its key or its checksum          | A miss with `undecodable`, and nixie removes the file   |
| A spool file arrives after nixie closed its capture             | A miss with `capture_closed`                            |
| Intake fails 5 times in a row on one spool file                 | A miss with `intake_failed`, and nixie removes the file |
| nixie stops mid-step                                            | At its start, nixie closes every open capture           |
| nixie stops between the key, the file and the record            | At its start, nixie removes the leftover                |

- In the first row, nixie writes a log line with a reason code.
- In 4 rows, a model call of the step has no logged request: the missing `capture` key, the 2
  folders that differ, the proxy's stop and the `.part` file past `close_wait`. The count check at
  the capture's close then writes a miss with `not_received`.
- A spool file that arrives after its capture closed is unreadable, because nixie destroyed the
  private key.
- After nixie stops mid-step, the rerun of the step opens a capture of its own.
- The leftover of the last row is a file with no row in `turn_inputs`, or a key with no file.
- The miss reasons `unknown_capture` and `store_unavailable` have no stated trigger. (open: miss
  reason triggers)

## Not in scope

- A read of a logged request by nixie itself, and a turn that nixie runs from a stored request.
- A logged request that outlasts retention or a forget.
- A normalised view of a request with a parser per model API, and a compare of 2 requests.
- A way to open a logged request from an enrolled device.
- A removal of the log's records from the event log.
