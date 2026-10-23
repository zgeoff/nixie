# Check a turn on a preview through the API

A check on a [preview](../../preview/README.md) can send one turn through nixie's API and read the
records that turn wrote, so it confirms the turn from the event log as well as from the reply. The
[API](../architecture/channels/api.md) is oRPC under `/rpc`. Every call is a `POST` to
`/rpc/<procedure>`, such as `/rpc/conversation/send`, with a JSON body of `{"json": <input>}`, and
the answer is `{"json": <output>}`. The answer's `meta` list marks each date, which arrives as an
ISO 8601 string. The API answers a refused call with a `json` object that holds the error's `code`,
`status` and `message`, such as `UNAUTHORIZED` with status 401 for a call with no device session.

Every call carries the `x-nixie-client` header, whose value can be any name. A call without it gets
HTTP 403 with the text `the client header is missing`. The commands below use `curl`, `jq` and
`uuidgen`, and send `x-nixie-client: checker`.

## Send one turn and read its records

1. Start the preview and read a sign-in code, as [Run it](../../preview/README.md#run-it) says.
   Leave the code off the sign-in page: a code signs in one device, once, and this check enrols its
   own.

2. Set the origin that the preview listens on:

   ```bash
   origin=http://127.0.0.1:8080
   ```

3. Enrol a device that takes its session as a bearer token, and keep the token:

   ```bash
   token=$(jq -n --arg id "$(uuidgen)" --arg code '<sign_in_code>' \
       '{json: {clientActionID: $id, code: $code, deviceName: "checker", tokenDelivery: "bearer"}}' |
     curl -s -X POST "$origin/rpc/sessions/enrol" \
       -H 'content-type: application/json' -H 'x-nixie-client: checker' -d @- |
     jq -r .json.token)
   ```

   Expect `$token` to hold the session token. A code that is unknown, used or lapsed gets
   `ENROLMENT_CODE_INVALID`, and `$token` holds `null`.

4. Send one message on the `conversation` thread, and keep the sequence that the API returns:

   ```bash
   text='What is two plus two?'
   sent=$(jq -n --arg id "$(uuidgen)" --arg text "$text" \
       '{json: {clientMessageId: $id, text: $text, spans: [{start: 0, end: ($text | length), source: "typed"}], thread: "conversation"}}' |
     curl -s -X POST "$origin/rpc/conversation/send" \
       -H 'content-type: application/json' -H 'x-nixie-client: checker' \
       -H "authorization: Bearer $token" -d @- |
     jq .json.sequence)
   ```

   Expect `$sent` to hold a number: the sequence of the `owner_message` record. The one span covers
   the whole text, and its end counts UTF-16 code units. `jq`'s `length` counts code points, which
   match for text with no emoji or other character outside the Basic Multilingual Plane.

5. Read the thread's newest page, and repeat the read until the turn ends:

   ```bash
   jq -n '{json: {thread: "conversation", limit: 200}}' |
     curl -s -X POST "$origin/rpc/conversation/read" \
       -H 'content-type: application/json' -H 'x-nixie-client: checker' \
       -H "authorization: Bearer $token" -d @- > page.json
   jq --argjson sent "$sent" '.json.lastStepEnd | select(.sequence > $sent) | {kind, task}' page.json
   ```

   The turn has ended when the `jq` command prints a record. `lastStepEnd` holds the thread's newest
   record that ended a step, and the turn's step ends after its message. Expect
   `task.step_committed`. A `task.step_errored` record means the turn failed: its `task.error` holds
   the reason, and its `task.retryAt` holds the time the step runs again.

6. List the turn's records:

   ```bash
   jq -c --argjson sent "$sent" \
     '.json.records[] | select(.sequence >= $sent) | {sequence, kind, text: .message.text}' page.json
   ```

   Expect the records in this order, with others between them:
   - `owner_message`, whose text is the message you sent.
   - `task.step_started`, as the conversation's step takes the message.
   - `model.reply`, one for each model message with text. The last one holds nixie's reply.
   - `model.turn_ended`, with the turn's usage and context.
   - `task.step_committed`.

   The records between them include the memory recall and a `tool_called` and `tool_result` pair for
   each tool call. A page holds at most 200 records. When `.json.hasEarlier` is `true` and the page
   starts after `$sent`, read the earlier page with `beforeSequence` set to the page's first
   sequence.

To follow the records as nixie writes them, instead of repeating the read, call `records/follow`
with `afterSequence`. The API answers it with a live event stream, which the
[API](../architecture/channels/api.md#reading-and-the-live-stream) describes.

## Start the next check from an empty log

> **CAUTION:** A reset removes every record, every memory, the conversation and every sandbox of the
> preview. Only a restore from a backup undoes it.

1. Reset the preview from the `preview` folder, and keep the enrolled devices:

   ```bash
   docker compose exec -T nixie /app/preview/run-preview.sh reset --keep-sessions --yes
   ```

   Expect the output to start with `nixie removed the log up to sequence`, and its first line to
   count the device sessions it kept signed in. The server then exits and its container restarts.

2. Wait for `http://127.0.0.1:8080/health/ready` to answer HTTP 200.

The same token stays signed in, so the next check starts with the message send of
[Send one turn and read its records](#send-one-turn-and-read-its-records).
