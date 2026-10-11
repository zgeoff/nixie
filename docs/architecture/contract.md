# The client contract

`libs/contract` holds the oRPC contract that nixie's API implements and every client calls, under
[0029](../decisions/0029-channels-and-clients.md). It also holds the code both clients share: the
TanStack Query helper and the paste-span logic. The package holds schemas, types and pure functions,
and no server code, so a client may depend on it.

## The procedures

The contract has 3 kinds of procedure: reads, which the client caches; checked actions, which change
state; and the live stream of log records.

- **Checked actions.** The client creates an ID once per action and sends it on every retry, so the
  server applies the action once. A message send uses the client message ID as that ID. The server
  refuses an ID that arrives again with a different input.
- **Sessions.** Every procedure except enrolment needs a session. Enrolment delivers the token as an
  `HttpOnly` cookie to a browser and in the response to the Android app. The server keeps only a
  hash of each token, so a retried bearer enrolment receives a fresh token for the same session.
- **The client header.** Every call carries a custom client header, and the API refuses a call
  without it. **Why:** a cross-site form cannot send a custom header.
- **The live stream.** A conversation read returns a page of records with the log sequence it read
  at. The client follows the log from that sequence, and each streamed event's ID is its record's
  sequence, so a reconnect resumes with no gap and no repeat.

A client renders a record by its kind, and shows a kind it does not know by name.

Once released, the contract only grows. A release adds procedures, optional input fields, output
fields and enum members, and never removes or renames one. **Why:** a client from an older release
keeps calling the newer server.

## Query helper

The query helper wraps a client for TanStack Query, with every query key under `nixie`. Each client
builds its own oRPC client and link, so the transport and the session handling stay in the client. A
client that imports only the helpers and the contract types bundles none of the schemas.

## Paste spans

The paste-span logic records how each span of a message box arrived: typed, pasted, dropped or
unknown. Memory evidence needs text you typed, so every path that cannot tell fails closed to
unknown.

1. Before each input, the client records the browser's input type and the text box's selection.
   Undo, redo and any input type the logic does not list map to unknown, because they restore or
   insert text without saying where it came from.
2. After each input, the logic applies the edit at the recorded selection. The selection pins where
   the edit happened, so a paste next to repeated text keeps its label.
3. An insertion that does not replace exactly the selection, such as a spelling fix elsewhere in the
   box, falls back to a plain diff, and its inserted text counts as unknown. An edit with no
   recorded input falls back the same way, so a client discards its recorded input after each edit.

Offsets count UTF-16 code units, as JavaScript string indices do, and an edit boundary never splits
a surrogate pair. The logic needs only the 2 strings and the recorded input, so a client without the
browser's input events records the input from its own paste hook.
