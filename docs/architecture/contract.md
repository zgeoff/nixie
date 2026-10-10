# The client contract

`libs/contract` holds the oRPC contract that nixie's API implements and every client calls, under
[0029](../decisions/0029-channels-and-clients.md). It also holds the code both clients share: the
TanStack Query helper and the paste-span logic. The package holds schemas, types and pure functions,
and no server code, so it carries the `lib` tag without `server-only` and a client may depend on it.

## The procedures

[contract.ts](../../libs/contract/src/contract.ts) defines every procedure, in 3 kinds:

- **Reads**, `sessions.list` and `conversation.read`, which TanStack Query caches.
- **Checked actions**, `sessions.enrol`, `sessions.issueCode`, `sessions.revoke` and
  `conversation.send`, each with a client action ID and typed errors.
- **The live stream**, `log.follow`, an event iterator of records.

- **Checked actions.** The client creates a UUID once per action and sends it on every retry, so the
  server applies the action once. `conversation.send` takes the client message ID as its client
  action ID. Every checked action declares `CLIENT_ACTION_ID_REUSED`, which the server returns when
  an ID arrives again with a different input.
- **Sessions.** Every procedure except `sessions.enrol` declares `UNAUTHORIZED`. Enrolment takes
  `tokenDelivery`: `cookie` for a browser, which receives an `HttpOnly` cookie, and `bearer` for the
  Android app, which receives the token in the output.
- **The live stream.** `conversation.read` returns a page of records and `readAtSequence`, the log
  sequence it read at. The client passes that sequence to `log.follow`, whose event ID is each
  record's sequence. A reconnect with `Last-Event-ID` therefore resumes with no gap and no repeat.

Each record carries its envelope and, for a message, its text and spans. A client renders a record
by its `kind` and shows an unfamiliar kind by name.

**Add-only:** once released, the contract only grows. A release adds procedures, optional input
fields, output fields and enum members, and never removes or renames one. **Why:** a client from an
older release keeps calling the newer server.

## Query helper

`buildQueryUtils` wraps a client in `@orpc/tanstack-query`, with every key under `nixie`. Each
client builds its own oRPC client and link, so the transport and the session handling stay in the
client. Reads use `queryOptions`, checked actions use `mutationOptions`, and the live stream uses
`experimental_streamedOptions`.

A client that imports only the helpers and the contract types bundles no zod and no schema, because
`package.json` sets `sideEffects: false`.

## Paste spans

The paste-span logic records how each span of a message box arrived: `typed`, `pasted`, `dropped` or
`unknown`. Memory evidence needs text you typed, so every path that cannot tell fails closed to
`unknown`.

1. On `beforeinput`, the web client calls `buildPendingInput` with the event's `inputType` and the
   text box's selection. `pickSpanSource` maps the input type to a source. Undo and redo restore
   text without saying where it came from, so they map to `unknown`, as does any unlisted type.
2. On `input`, the client calls `buildSpanState` with the previous state, the pending input and the
   new text. The selection pins where the edit happened, so a paste next to repeated text keeps its
   label.
3. An edit with no pending input falls back to a plain diff, and its inserted text counts as
   `unknown`.

Offsets count UTF-16 code units, as JavaScript string indices do. An edit boundary never splits a
surrogate pair. `buildSpanState` needs only 2 strings and a pending input, so a client without
`beforeinput` builds the pending input from its own paste hook.
