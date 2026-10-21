# 0047: What the model learns about a connection that stops working

- Date: 2026-10-16
- Status: decided
- Issue: [GEO-827](https://linear.app/zgeoff/issue/GEO-827)

The model learns about a connection that is not healthy from a line in its context, never from a
stub tool, and never by silence. The line covers 4 statuses: `needs_consent`, `disconnected`,
`failing` and `expiring`. `forgotten` never shows. The model learns at 3 moments:

1. **When a session opens.** A status entry lists each connection on the caller's list whose status
   is one of the 4. The model credential joins the list when it is `expiring`, although it has no
   tools. The entry renders nothing when every connection is `active`.
2. **When a status changes during a session.** An entry in the events block reports, before the next
   message, each change into one of the 4 statuses, each return to `active`, and a break that has
   lasted 2 days, once per break.
3. **When the model calls a tool that its connection's status stops.** The call returns an error of
   the kind `connection_unavailable`.

## What the line holds

Each connection in the status entry carries:

- its connector, label and account;
- its status, and for `failing` the reason, from a fixed set: `unauthorised`, which you fix by
  reconnecting, or `service_error` and `no_answer`, which clear without you;
- the time its status began, and the time of its last success;
- the tools its status removed, by name up to 5, with a count of the rest;
- where in the client you reconnect it, such as "Settings → Connections".

An event for a return to `active` also counts the calls that failed during the break and the job
runs that ran without the connection, such as "2 calls failed, 1 job run ran without it".

Every time in the status entry and the events block shows the date, the time and the zone, in the
zone that the time tool answers in, as every other event does.

The line holds only values: names, statuses, times and counts. Its sentences, the reconnect place
and the rule that tells the model when to raise a status are template text from nixie's definitions.
The provider's refusal text, such as an `invalid_grant` detail, never enters the line.

## When the model raises it

The rule in the template:

- Tell you about a connection that needs attention when a request needs it, or when you ask.
- On the event for a break that has lasted 2 days, tell you once, at a natural moment.
- Raise a `disconnected` connection only when a request needs it, because you chose it.
- Mention an expiry only when it falls within the time a request covers, or when you ask. The model
  credential is the exception: tell you once, unprompted, 3 days before it expires.
- Say each of these once per session.

The 2 days and the 3 days are configurable defaults.

## The error on a call

A call that a connection's status stops returns `connection_unavailable`, with `origin` `nixie`, and
never reaches the provider. The error carries the same values as the line: the status, the reason
for `failing`, the time since and the reconnect place. This covers a `failing` connection, which
until now returned `fetch_refused`, and a tool that a change removed during the session. A call to a
tool of a connection forgotten during the session returns `connection_unavailable` with no other
field, so it names neither the connection nor the status. `fetch_refused` keeps its meaning: a
refused host or address.

A `failing` connection keeps its tools listed, so a call can succeed once the connection recovers.

## Jobs

A job run gets the same line, limited to the connections pinned on the job's list, beside its
trigger details. The model credential stays out of a job run's line, because a job run can do
nothing about it. A job run starts whatever the status of its pinned connections. It does what it
can, and its result says what it skipped and why.

## Several connections

When one of several connections of a connector stops working, the connection argument drops that
connection's value, and the line names it.

## Why

- A tool that vanishes without a reason leaves the model unable to tell "Gmail needs consent" from
  "nixie has no Gmail", so it can neither explain the gap nor tell you what to do.
- The line costs nothing in the normal case, because the entry renders only when a connection needs
  attention.
- The line lives in the session's first user message and in the events block, where every change in
  a session already goes. The system prompt and the tool list stay as they were, so the cached
  prefix holds.
- The model knows before it acts, so it can answer "send that email" with the reason at once instead
  of after a failed call. The tool names let it see straight away which requests the break stops.
- The restart event already names each tool added or removed. A status change removes tools without
  a restart, so it needs the same kind of line.
- A return to `active` is an event, so the model stops reporting a fault after you fix it. Its
  counts tell the model what failed during the break, so the model never assumes everything ran.
- The reason for `failing` tells the model whether you must act or the fault clears alone. The time
  of the last success tells a flicker from a dead connection, so the model stops repeating a call
  that cannot work.
- The reconnect place lets the model point you to the fix, not just name it.
- A break that you never meet in a request would stay broken for weeks under a rule that waits for a
  request. One event per break past 2 days gives the model one mention without a reminder in every
  session. nixie, not the model, tracks the time, because the model cannot know what it said in an
  earlier session.
- The model credential keeps the assistant running, and no request ever covers its expiry date. When
  it expires, the assistant stops and cannot explain why afterwards, so it warns once ahead.
- `disconnected` shows, so the model says you disconnected it, not that nixie lacks it. It is raised
  only on request, because you chose it.
- `failing` shows only after the store marks it, so a short provider blip never reaches the line.
  The store marks `service_error` and `no_answer` after 3 failures in a row, and `unauthorised`
  after a second rejection that follows a refresh. Its tools stay listed, because tools that vanish
  are the confusion this decision removes, and a call can succeed once it recovers.
- `expiring` shows because you talk to the assistant more than you open the client, and the
  assistant can then warn before something breaks.
- `forgotten` never shows, because Forget is an erasure. The line would carry the label, which
  defaults to the account address, into every later session: the trace that Forget destroys keys to
  prevent. The model can do nothing with it, and the client answers whether a connection was
  forgotten.
- The error carries the line's values, so the model knows from the error alone that its call was not
  wrong, and what you must do.
- `connection_unavailable` names the cause. `fetch_refused` reads as a web fetch and already means a
  refused host or address, so a status under that kind would mix 2 causes.
- Times carry the date and the zone, as every other event does, because the model reads a bare time
  wrongly.
- A job runs untrusted with nobody watching, so the line is its only way to report what it could not
  do. Without the line, a job run that finds a tool missing makes something up or fails without a
  reason.
- A job run starts anyway, because a part of a report has value: a morning report without Gmail
  still has the calendar. The repeated "skipped" result also reminds you to reconnect.
- The assistant read a draft of the line, and the reason for `failing`, the reconnect place, the
  counts on recovery, the last success, the tool names, the full times, the 2-day event, the
  model-credential exception and the error kind come from that reading.

## Alternatives

- **A stub tool that returns the status.** It keeps a tool by the real name with a different schema,
  which misleads the model. The model learns only when it calls the stub, it costs more tokens than
  a line, and each status change alters the tool list, which breaks the cached prefix.
- **Nothing.** The client alone tells you. The model then cannot explain why it cannot do a request,
  which is the gap that the [Mastra Connect spike](../../research/mastra-connect/README.md) found.
- **A one-time, unlabelled event for a forget.** It does not break the erasure, but it adds a kind
  of event that the model has no use for.
- **Leave out `expiring`.** It costs you the warning in the place where you talk to the assistant.
- **Remove a `failing` connection's tools.** The model then meets the same silent gap, and loses a
  call that would succeed after recovery.
- **Let the model track whether it raised a break.** The model cannot see what it said in an earlier
  session, so it would repeat the break or never raise it.
- **`fetch_refused` for a status.** It mixes a status with a refused host, and reads as a web fetch.
- **`tool_unavailable`.** It names the effect, not the cause, and the error must tell the model that
  the connection, not the tool, is at fault.
- **Name every tool a break removes.** A connector with many tools fills the line, so the line names
  5 and counts the rest.
- **Skip a job run whose pinned connection is not healthy.** It loses the useful part of a job with
  mixed tools.
- **Hold the job until you re-enable it.** A reconnect alone does not resume it, and one lapsed
  token stops every job that pins it.
- **Run unless no tool on the job's list can still work.** It saves a pointless run of a job that
  needs only that connection, but it adds a rule that counts tools. It can come later, once a real
  job shows the cost.

## Consequences

- The credential store's statuses state what the model learns for each status. The store keeps the
  reason for `failing`, the time a status began and the time of the last success.
- The tools design states the status entry, the events-block entry, the rule, and the
  `connection_unavailable` kind, which replaces `fetch_refused` for a `failing` connection.
- The status registry gains an entry that reads credential statuses, and the events-block registry
  gains an entry for status changes, recoveries and the 2-day event. Neither needs a change to the
  builder.
- nixie counts the failed calls and the job runs without the connection over each break, for the
  recovery event.
- The connection argument loses a connection's value while that connection is `failing`,
  `needs_consent` or `disconnected`, and gets it back on recovery. An `expiring` connection keeps
  its value, because its calls still work.
- A job run's context gains the line beside its trigger details.
- The client's reconnect place becomes template text, so a change to the client changes the
  template.
