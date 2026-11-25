# Conversation turns

The conversation answers the user one turn at a time. Each turn is one step of the conversation
task: the step hands the task's unread inbox to a model loop, the loop runs on the Agent SDK in a
long-lived sandbox. The host writes each reply to the log as the model writes it, and the step
commits the point the loop's session reached. The event log is the record of the conversation, and
the SDK's session transcript is a cache that makes the next turn cheaper. [Tasks](./tasks.md) covers
steps and their commits, [model profiles](./model-profiles.md) covers the profile a turn runs on,
[tool calls](../connectors/tool-calls.md) covers the endpoint that serves the loop its tools,
[memory in context](../memory/context.md) covers the pinned core and the items each turn places,
[session opening](./session-opening.md) covers what a new session opens with, and
[compaction](./compaction.md) covers how nixie shrinks a session that grows past its threshold.
`modules/sessions` holds the host side, `guests/conversation` holds the guest, and the turn frames
between them live in `libs/wire`. The sessions package runs every model loop's sessions, the
conversation's and the memory roles' alike, and takes each loop's profile from the models package,
which holds only the profiles and the call cost.

## The guest and its sandbox

The guest is the one package that imports the Agent SDK, under
[0003](../../decisions/0003-sdk-placement.md), so the SDK and the CLI it spawns run only inside a
sandbox. The conversation image holds the guest's 2 bundles, `/app/conversation/main.js` for a turn
and `/app/conversation/check.js` for a check, and the SDK's CLI at `/app/claude`, and nothing of the
workspace. The host starts a guest as `bun --no-install /app/<package>/<file>.js`, so Bun never
installs a package that a bundle lacks, and the bundles name the CLI's path. The image runs as an
unprivileged user whose home holds the SDK's session transcripts.

At start, nixie stores the conversation profile's credential with the sandbox backend and keeps the
conversation's sandbox when its spec matches the one the profile gives and its adapter has not
retired it. A changed spec, such as a new image or a rotated credential, replaces the sandbox, so a
turn never runs with a grant for a profile nixie no longer uses. nixie replaces a retired sandbox
the same way, such as an imp that the sandbox backend still backs up. The sandbox's owner is the
conversation task, which never finishes, so the sandbox outlives each step and the transcripts on
its disk outlive each turn. nixie never puts the conversation's sandbox to sleep, so the user's next
message never waits for a wake.

A replacement keeps the session. nixie creates the new sandbox before it destroys the old one, and
copies the session that the conversation resumes, its transcript and its side folder, from the old
disk to the new one. The copy wakes a sleeping old sandbox first, because each read runs in its
guest. The copy also runs on an old sandbox that lost its grant, such as after a rebind of the model
secret. The CLI names a session's project folder after the working directory, so the copy lists the
files from the old guest's home and writes them under the folder that the new guest's own home
names. A start that stops before it destroys the old sandbox leaves both, so the next start copies
again into the sandbox it keeps and overwrites what the stopped copy wrote. No turn runs while an
old sandbox remains, so the old copy is never behind. The copy writes the transcript under a staged
name and renames it once every file has landed, so a copy that fails partway leaves no session to
resume. The copy tries each old sandbox in turn. When every copy fails, nixie logs a warning and the
start goes on, so a deploy never fails on the copy.

Each step spawns the guest in the sandbox for one turn. The host writes a turn frame to the guest's
standard input, and the guest writes its own frames to standard output. Both directions use the wire
framing, and a schema checks each frame's JSON on arrival, so a frame from a broken guest ends the
turn as an error rather than as a record.

## What a query holds

Every query the guest makes holds nixie's tools and nothing else. The options turn off the SDK's
built-in tools, every settings source, the bundled skills and the SDK's own memory, and they allow
only nixie's MCP server, so the loop cannot read a file, run a command or remember anything outside
the event log. The strict MCP option keeps every other MCP server out of the loop. The options turn
off the CLI's prompt dispatch too, so a message that starts with `/`, such as `/clear`, reaches the
model as text and never runs a built-in command or a bundled skill. The checker's query sets the
same switches. The turn frame holds the system prompt, and the guest sets it as a custom prompt with
the SDK's snapshot off, so a resumed session runs on the prompt the host rendered for this turn.

The turn frame holds the profile's base URL, model, effort, auth header and context cap, and the
guest sets them in the query's environment. The guest holds a placeholder in place of the
credential, and the sandbox's grant swaps in the real one on the way to the profile's host
([model profiles](./model-profiles.md#credentials)). The frame also holds the URL of the tool route
and the turn's own step token, which the guest gives the SDK as an HTTP MCP server that must connect
before the loop starts. The step token ties each tool call to the step that runs the turn
([tool calls](../connectors/tool-calls.md#one-endpoint-per-run)).

### The request rewriter

The CLI puts 2 blocks of its own ahead of nixie's system prompt in every request: a billing header
and an identity line. A model outside Claude reads the identity line as the first words of its
persona, so a frame whose profile carries `requestRewrite` starts a loopback request rewriter before
the CLI. The guest gives the CLI the rewriter's address as its base URL and adds `127.0.0.1` to
`NO_PROXY` and `no_proxy`, so the sandbox's proxy never carries the CLI's hop to the rewriter. A
frame with a null `requestRewrite` starts no listener and gives the CLI the profile's own base URL,
so a Claude request reaches upstream as the CLI built it.

The rewriter sends each request to the frame's whole base URL, then to the path and query the CLI
used, through the sandbox's proxy, so the credential broker adds the credential as it does for the
CLI.

- A `POST` of a messages request keeps the shortest run of system blocks at the end of the list
  whose text, joined, equals the frame's system prompt, and drops every block ahead of it. Each kept
  block goes on as it came, with its cache marker. With a provider pin, the request also gains a
  provider order, with fallbacks off.
- A `POST` of a token count loses the blocks the same way and gains no provider order.
- A `GET` of the model list goes on as it came.
- The rewriter refuses every other request, and every request whose system prompt is not a list of
  text blocks or holds no tail equal to nixie's prompt. It holds no list of the CLI's wordings.

A refusal sends the CLI a 400 in the Messages error shape and sends nothing upstream. The first
refusal stands, and the rewriter refuses each later request with it. The guest ends the turn, or the
summary, with one `failed` frame whose reason is `error` and whose detail is the refusal's text.
When the listener cannot bind, the guest sends `failed` with the bind error and never starts the
CLI. The guest stops the rewriter after the CLI exits. A failed or refused upstream response reaches
the CLI as it came.

The checker's query runs no rewriter, so the config refuses a checker role on a profile outside
Claude.

The guest ends the turn with a failure when nixie's server is not connected, because a loop without
its tools would answer from the model alone, and its replies could claim actions that never ran. The
CLI builds its first model request from the servers connected when the turn's first message arrives.
The guest therefore reads the server's status before it sends that message, and when the connection
failed, it waits a moment and reconnects once, so a tool route that dropped one connection does not
fail the turn. A failure that outlasts the reconnect carries the CLI's connection error. The guest
checks the session's opening message as well, which lists each MCP server's status.

## Resume and fork

Each step commit stores the session boundary: the session's ID and the ID of the last message in it.
The next step parses the boundary and resumes the session at that message, on a fork. The fork gives
each turn a new session that copies the history up to the boundary, so a turn that crashed before
its commit leaves its partial messages in a session no later turn resumes. A rerun of the step
therefore starts from the same point as the first try, and the model never sees the lost attempt.

Each fork copies the whole history, so the guest removes every session on its disk but the one it
resumes before the turn starts. The disk then holds at most the resumed session and the fork the
turn writes, rather than a growing copy per turn.

A guest can die after one result and before the next, once a message that landed mid-turn started a
second model call. The step then counts only the reads that came before the last result, because the
next turn resumes at that result's boundary, and a record read after it stays unread for the next
step to send again. A reply the host wrote after that result belongs to the part of the turn that no
session keeps, so the step voids it with the reason `turn_dropped`.

## Compaction

The history in the session only grows, so nixie compacts it between turns with a summary that the
event log holds ([compaction](./compaction.md)), and nixie's compactor is the only one. The guest
sets every compaction control in the query's settings rather than leaving it at the SDK's default,
so an SDK upgrade cannot change it. Auto-compaction, precomputed compaction and idle compaction stay
off, and the guest's environment turns off the manual compaction command too, because each would
change the session outside a step, with a summary that the event log never holds. A step's commit
records the session's last message as the point that [restart sweep](./leases-and-restart-sweep.md)
resumes at, so the session changes only inside a step that holds the task's lease.

A turn reports its context against the window nixie compacts within, which comes from the profile's
context cap, with a default for a profile that sets none.

## Opening a new session

A turn opens a new session when it has none to resume. The conversation's first turn has no session
boundary, a replacement sandbox whose session copy failed holds no session, and a forget's session
cleanup invalidates the session
([forgetting and the live session](../memory/context.md#forgetting-and-the-live-session)). Each
turn-ended record keeps the newest session-invalidated record the turn saw before it ran. The step
resumes no session when a newer invalidation exists, so a step that commits after an invalidation it
never saw leaves the session invalid. When the guest instead reports the session lost, the step runs
the turn again on a new session. A persona change invalidates the session as well, because the
persona sits in the system prompt that a resumed session keeps. The session-opened record keeps the
persona hash and the policy hash in force at the opening, and the step resumes the session only
while its persona hash matches the persona in force. A change to the policy alone keeps the session
and its cached prompt, because each tool call reads the policy in force at the call, so the policy
hash on the record serves audit. A session opened before openings kept the persona hash resumes,
since nothing shows that its persona changed. A session from before opening records holds the pinned
core only in its old system prompt, and an older guest's CLI compaction dropped the opening from its
session's transcript, so the step opens a new session in place of either.

Each step reads the session's state from the log once, before it acts, and one transition table
gives the events each state allows: open, resume or compact. Both step paths ask the table, so the
resume rule has one copy.

Every new session opens from one builder, with the status, the pinned memory, the newest summary and
the recent turns before the turn's own blocks, and the step writes a session-opened record in the
turn's commit ([session opening](./session-opening.md)). A turn that resumes its session carries no
opening. The SDK transcript is a cache, so a rebuild restores the conversation's recent context from
the event log rather than an identical session.

## Inbox records as messages

The step sends each unread inbox record into the loop as a user message whose SDK message ID encodes
the record's log sequence. The guest decodes the IDs the SDK acknowledges, and the step reports the
matching sequences as read, so the read cursor moves only over records the model received. A record
the turn never reached stays unread, and the next step sends it again.

A turn opens with no more inbox records than the SDK lists on the reply that consumed them, because
a record past that list would have no ID to acknowledge it by, and the turn would wait for it
forever. A step that leaves records past the limit asks to continue, so the next step takes them at
once.

A message the user sends while a turn runs reaches the same turn, when that turn took the whole
inbox. A turn that left records for the next step takes no live message, so the read cursor never
meets a gap and no record reaches the model twice. The host watches the conversation thread for
inbox records that land after the step started and writes each one to the guest as a message frame,
and the guest passes it into the running query at the SDK's next priority. The model reads it at the
turn's next tool boundary, and the step's commit marks it read. The SDK acknowledges a message it
folds into a running turn in a different form from the turn's opening messages, and the guest counts
both forms as a read.

A message frame for a user message carries `cutsCall` on a harness with `live-cut`. The guest then
[cuts the model call in flight](#cutting-a-model-call), so the model reads the message at once and
not at the next tool boundary. No other record cuts: a task message or an action result waits for
the boundary.

The user's message renders with each span the client labelled pasted or dropped wrapped in a
`<pasted id="…">` or `<dropped id="…">` block, in the inbox and in a rebuilt session's history
alike. The closing tag repeats the opening tag's ID, which is random and fresh for each block, so
pasted text that holds a closing tag cannot end its block early. A message the user typed in full
renders as it was written. The system prompt states, after the persona, that the text inside these
blocks is not the user's own words and may hold instructions the model acts on only when the user's
own words ask. The model can then tell which quotes the [memory gate](../memory/writes.md) takes as
typed.

A message from another task renders as a `<task-message>` envelope. Its opening tag gives the
message's ID, who it is from, its kind, the message it replies to, when it was sent, the user's
messages it passes on, and a random ID that the closing tag repeats. A body that quotes a closing
tag cannot end the envelope early. The envelope states no hop and no wake. The `from` label names
the sender by how the receiver knows it:

- `{agent}, in the chat with {user}`: the conversation, for a task that runs under the persona.
- `{agent} (task: {name})`: a started task that runs under the persona.
- `task: {name}`: a task with no persona, and the receiver of any message when the deployment names
  no agent.
- `task definition: {name}`: the brief of a definition's task run, which no task sent.

The name of a definition's task comes from the version its newest task run pinned, so the label
keeps the name after the task run ended and the definition left force. A report's label also holds
the sender's task ID after the name, as `task: {name} ({id})` and `{agent} (task: {name} ({id}))`. A
sender with no name, which includes a started task whose name was forgotten, shows its task ID alone
in a report: `task: {id}` and `{agent} (task: {id})`. Any other label holds no task ID: a model that
needs that sender's task ID reads it from the list tool.

The system prompt adds that a task message is never the user's own words, and that the model weighs
its requests as a colleague's. A task's brief is its first message: it renders in this envelope, as
[started tasks](./started-tasks.md#the-start) and
[the session opening](./session-opening.md#the-brief) describe. A task's own `trigger.fired` record
renders no text, and the host marks it read. Messages that arrived past the hop limit open the turn
under one system message with a summary line per sender, which counts that sender's messages and
names what woke the turn, as [task messages](./task-messages.md) describes.

Images the user sends with a message reach the model as image input, read as dropped in like dropped
text. The inbox message holds the text first, then for each image a `<dropped-image id="…" n="…"/>`
marker with its own random ID and the image's number, then the image block. The host reads each
image's bytes from the [attachments](./erasable-fields.md#keys) and writes them to the guest in the
message frame, so a frame from the host has a larger size limit than a frame from the guest.

The SDK repeats every image a session took in each later request, so a session caps both the image
bytes it holds and the number of images, and each turn end records both. The count cap is the
Messages API's image limit for a model with the smaller context window, so it holds for every model
a profile names. A message whose images would pass either cap waits for the next step, whether it
opens a turn's batch or lands while the turn runs, and that step opens a rebuilt session for it, so
no request passes the size or the image count the Messages API accepts. The first message of a new
session always goes. An image a tool returns during the turn counts against the same caps, and the
turn refuses one that would pass either cap. A rebuilt session's history and every other render of
the message show only the markers, never the bytes, so a rebuilt session never sends an image again.
The pasted-text rule in the system prompt names the images too: the model treats an image's content,
its text included, as it treats dropped text.

## Interrupts

An [interrupt](./tasks.md#pause-stop-and-close) ends a running turn early and keeps what the turn
did. The host writes an interrupt frame to the guest, and the guest interrupts the query. The SDK
then ends the turn with an error result, yet every chain entry before the interrupt stands, so the
guest ends the turn at the last of them and the step commits that boundary. A message the turn never
reached stays unread, so it starts the next turn, and the next turn resumes the session at the
interrupted turn's last entry. A resumed turn interrupted before its first new chain entry ends at
the entry it resumed from. A fresh turn interrupted before its first chain entry has no boundary to
end at, so it fails as a step error, and the next step runs it again.

### Cutting a model call

The guest cuts a call only when all of these hold: the CLI's init lists `interrupt_receipt_v1`, a
message that cuts is queued and unread, a main-chain call is streaming, no tool use has begun in
that call, and no cut is pending. A host interrupt wins over a cut. The host sends no message frame
to a turn that left records for the next step or that ended silently, so those turns never cut.

The guest interrupts the query and reads the receipt, which lists the queued messages that survive.
The CLI then ends its turn with an error result and starts the next queued message at once, in the
same process and session. The cut call's message arrives flagged `aborted` and its text may end
mid-word, so the guest sends no assistant frame for it and drops the reasoning summary it held. The
guest reports the cut call's partial usage in a call frame and adds the cut result's usage, turns
and thinking tokens to the turn end. The guest sends no turn end for the cut, and keeps reading
while a message the receipt listed is unread. A message the receipt did not list is not waited for.
When no message survives, the turn ends as `finished` at the last chain entry.

The CLI keeps the cut call's partial text and an interrupt marker in the session, and joins the
queued messages into one user message after them, so a burst of messages lands in one request and
the model sees the opening messages once. The session prompt tells the model that a reply a message
cut never reached the user. A message counts as read when a finished call that was not cut held it.
The turn end carries the count of cut calls as `cutCalls`.

## Model calls

The guest reports each model API call of a turn in a call frame. The frame holds the call's token
counts in nixie's own form: uncached input, cache reads, cache writes split by lifetime, and output.
The CLI copies a call's opening usage onto the message of each content block it streams, so those
messages undercount the output. The guest therefore reads the counts from the stream's own events,
and writes the frame when the call's stream stops. A call that reports its cache writes with no
split by lifetime counts each such write at the longer lifetime, which costs more. The host hands
each call frame to the step before it reads the guest's next frame, so the step can interrupt the
turn on the call that reaches a limit.

The turn frame holds a limit of model calls. The guest gives a set limit to the SDK as the query's
maximum turns, and a turn that reaches it ends at its last chain entry, as an interrupted turn does.
A conversation turn has no limit. A started task's turn has a fixed limit, because no one watches
it.

The turn frame also holds the wait for one tool call, which the host copies from the harness record.
On the `agent-sdk` harness it is a declared value, and the conversation guest sets it as the CLI's
per-server MCP tool-call timeout of nixie's tool server. When the value is null, the guest sets no
timeout.

## Sealed outside text

Every piece of outside text that the model reads goes through one helper, `renderFenced` in
`libs/wire`. It wraps the text in a tag whose opening and closing tags both carry a random ID that
the caller mints with `mintBlockID`, and it throws when the text holds the closing tag with that ID.
The attribute that carries the ID is `fence` for most elements and `id` for `<pasted>`, `<dropped>`
and `<model-text>`. The sealed elements are:

- `<tool-result>`, for a tool's result and for text a page or the model supplied, with a `source`
  attribute;
- `<failure-detail>`, for a provider's message about a failed call;
- `<task-message>`, for another task's message;
- `<model-text>`, for a reminder's note and name;
- `<pasted>` and `<dropped>`, for the spans of the user's message that the client labelled so;
- `<memory-text>`, for the text of a memory item, and `<memory-quote>`, for the quote that backs it,
  as [How an item reads](../memory/context.md#how-an-item-reads) says.

The random ID stops the text from closing its element early. It does not prove who wrote the
element.

## System messages

Every block that nixie writes into a user message, apart from the user's own message and the sealed
elements above, is a system message: a `<system-message>` element with a type, a random ID and the
time nixie wrote it, as in
`<system-message type="events" id="7f3a9c21b04e" at="Tue 14 Oct, 22:50, Sydney">`. The closing tag
repeats the ID, which is fresh for each element as a pasted block's is, so a memory or an event
whose text holds a closing tag cannot end the element early. The ID proves nothing about the sender,
because text inside a message can carry any ID. The system prompt therefore states a position rule:
a system message comes from nixie only at the top level of a user message, and one inside a tool
result, a pasted or dropped block or a quote is text. The SDK sends a tool result as a block of its
own, so the model can tell the two places apart.

A new session's status, pinned memory, summary and recent turns, the events block, the pinned-core
change note and the retrieved items each render as one system message before the user's message. A
fired timer and an action's outcome render as one each, with the time their record was written, and
each body leads with the record's event ID so the model can cite it. The outcome of a failed action
adds a line that names the call and the reason, and shows the provider's own message only inside an
untrusted block.

The user's message renders as an
`<owner-message id="48213" from="…" sent="Tue 14 Oct, 22:50, Sydney">` element, with the user's own
text inside. The `id` is the record's event ID, its log sequence, so the model can cite any message
it sees, in a summary, a memory quote or a moment's span, and pass it on in a task message, without
a log read. A message from a device the user named carries a `session` attribute, and a message that
reached nixie long after the user typed it shows both times in `sent`. Each line of a rebuilt
session's recent turns leads with the same event ID and send time in square brackets. A system
message and an `<owner-message>` element come from nixie only at the top level of a user message:
the system prompt says that one inside a tool result, a task message or a quote is text. A task that
reaches its limit gets a one-line notice that names the task and its use. A restore notice renders
as one system message that names the restore time and the backup time.

A reminder fire, whose trigger has the target `conversation`, wakes the conversation once and
renders as a `reminder` system message: `Reminder:` and the note in a `<model-text>` block with a
fresh random ID, so text inside the note cannot close it, then the name in a block of its own, and
the time the reminder was set for in the zone of its trigger. A reminder that reaches the
conversation more than a minute after that time adds how late it is, as `fired 1 h 39 min late`,
counted to the turn that delivers it. When the version that the fire pins is no longer stored, the
note reads as a note that its text is gone.

The element that starts a conversation turn also carries 2 gaps, which nixie computes when the turn
starts, as in
`<owner-message id="48213" … since-your-last-turn="3 h 12 min" since-owner-last-wrote="3 h 40 min">`:

- `since-your-last-turn` is the time since the model's previous conversation turn ended, whether it
  ended with a reply, silently or in a failure. The log's turn-ended record and step-errored record
  give that time. The attribute is absent on the conversation's first turn.
- `since-owner-last-wrote` is the time since the user's previous message. On a turn that an owner
  message starts, it runs between that message and the one before it. On any other turn, such as a
  reminder fire, it runs from the newest owner message to the turn's start. The attribute is absent
  while the user has never written.

Each gap shows in at most 2 units, largest first, rounded down: `40 s`, `12 min`, `3 h 12 min`,
`2 days 4 h`. Only the first element of a turn carries them, and so does an owner message that cuts
into a turn, with values computed when nixie reads it. Both sit in the user message, after the
cached prefix of the prompt.

A turn carries no list of tasks. The conversation reads them with the list tool when it needs them,
as [sending a message](./task-messages.md#sending-a-message) describes.

## Records of a turn

The guest asks the model for its reasoning as a summary, which the model gives as a thinking-only
message ahead of the one that carries the reply. The guest reports each assistant message with its
text, the tools it asked for and the reasoning summary that message holds, and ends with the
boundary, the stop reason, the SDK's reason for the end, the count of model calls, the token usage,
the turn's count of thinking tokens and the context. The model API reports the thinking tokens once
for the whole turn, never per message. The reply drops the signature that rides the summary, the
model API's own encrypted copy of the reasoning that nixie cannot read.

The SDK gives a context past its window an end reason of its own, apart from every other model API
error, so the host tells an overflow from a refused request on that reason alone. An overflowed turn
ends with the CLI's own message that the prompt is too long, and the guest keeps the boundary off
that message: at the turn's last other chain entry, or at its resume point when the turn wrote no
other entry. The step commits that boundary, so a retry forks the session before the overflow. One
exception: a fresh session that overflows at its first model call has neither, and its boundary
stays on the CLI's message.

The usage sums every model call in the turn, so it measures cost and not how full the context
stands. The context is therefore the last main-chain model call's input, cache-read and cache-write
tokens, beside the window nixie compacts within. The step turns these into records on the
conversation's thread. The host writes a reply record for each message with text as the guest
reports it, in a transaction of its own that the task's lease guards, so a reader sees the reply
while the turn still runs. The reply's text is erasable, and its payload names the run that wrote
it. The step commit writes one turn-ended record with the usage, the end reason, the context and the
count of thinking tokens and the count of cut calls, which the plain payload holds so that a
projection reads the count without a key and it outlives a forgotten reply. Each reply keeps the
model's reasoning from before it: the summaries gathered since the previous reply sit in the reply's
erasable fields, so a forget removes them with the reply. Each record holds the model ID and the
profile's ID from the profile nixie gave the turn, never from the guest's frames
([model profiles](./model-profiles.md#records-of-model-output)).

A `model.reply_voided` record marks one reply as never sent to the user. Its payload holds the
reply's sequence, the run's ID and the reason: `attempt_failed`, `attempt_lost`, `turn_dropped` or
`silent`. Each void is its own record, and a partial index on the reply's sequence answers the
lookup. The reasons mean:

- `attempt_failed`: the attempt threw, and its own runner wrote the void before it rethrew;
- `attempt_lost`: the runner died, and the next run of the step found the reply after the thread's
  last step commit with no void, and voided it before it did anything else;
- `turn_dropped`: the reply came after the last result of the turn, or the turn's session was lost
  or overflowed, so the step starts the turn again from the boundary.

A reader that feeds the model, such as the recent turns of a rebuilt session, the log read tool and
the moments, leaves out a voided reply.

The step returns to waiting once it commits, because the conversation always waits for the user's
next message. A turn that fails for any reason but a lost session, such as a disconnected tool
server, throws, so the tasks module records the error and retries the step after a delay that grows
with each failure in a row. The exception is a
[model API refusal that waits for the user](#a-call-the-model-api-refuses). The conversation never
fails ([tasks](./tasks.md#steps)).

### A turn that ends with nothing sent

A silent turn is a turn that ends by calling `turn.end_silently`. The model makes a turn silent by
calling `turn.end_silently`, a tool that the conversation and every
[started task](./started-tasks.md#start-options) hold on every turn. The tool list therefore never
changes, and the prompt cache holds. nixie wrote the tool's description to ask the model for the
call only when a task message or a timer woke the turn and nothing needs saying. When the host
accepts the call, its result carries `_meta` with `claude/endTurn: true`, and the model's loop ends
the turn after that tool call with no further model call. The guest reads that end as a finished
turn, whose last stop reason is `tool_use`.

The host answers the call from the inbox records that the turn holds. Those are the records that
opened the turn, and the records that the host passed into it while it ran, as
[inbox records as messages](#inbox-records-as-messages) describes. The host refuses the call when
one of them is the user's own message. The model reads the refusal as the tool's answer, and
replies.

When the host accepts the call, it stops passing records into the running turn. Any record that
lands after the call stays unread, and a waking record, such as the user's message, starts the next
step.

Text that the model wrote before the call stays a normal reply, because the host wrote it already.
The tool's answer tells the model to write no more text. The step writes the turn-ended record with
`isSilent: true`, marks the read records and commits the session boundary, as every step does. One
exception: when the model API refuses a later call, the step fails as
[a call the model API refuses](#a-call-the-model-api-refuses) describes. The
[API](../channels/api.md) names the mark `isSilentTurn` on its record, because one record type there
covers every kind, and the [client](../channels/client.md) shows the step as ended with no reply
only when the step holds no reply.

### A call the model API refuses

When the model API refuses a call, the CLI writes its own message about the refusal as an assistant
message. The guest fails the turn instead of reporting that message as a reply, so the message never
reaches the event log or a session that a later turn resumes. The step commits no boundary and no
read, so the user's message stays unread, and the next turn forks the session before the refused
call. The step's error record and the server's log keep the CLI's message. The events block lists a
retried turn that the model API refused without that message.

The step's error depends on the kind of refusal:

- A refused credential throws an error that names the credential, so the server marks the turns as
  failing at once ([server](../deployment/server.md#health)).
- A rate limit that the CLI retried, an overloaded or failing model API, and a refusal the SDK names
  as unknown retry with the conversation's backoff.
- A quota, a billing or account refusal, and a model that the API lacks wait for the user, because
  each retry fails the same way until the user changes something outside nixie. The conversation's
  next step runs once the user sends a message or retries the turn.

A retry of the failed turn runs it at once, whether the turn waited for the user or for its backoff
([tasks](./tasks.md#retrying-the-conversations-failed-turn)).

The CLI retries a rate limit within the call unless the model API asks for a wait past the CLI's own
limit, so the guest reads a rate limit that the CLI never retried as a quota. The CLI passes no
reset time on to the SDK, so nixie knows none. The replies that the model gave before the refused
call stay on the timeline, voided with the reason `attempt_failed`, and the next try runs the whole
turn again.

Two exceptions: a request the model API refused as invalid, and a reply cut at the output cap, end
the turn with its error message, because the host tells a context overflow from them only at the
turn's end. The guest marks that message as an error on the frame, and the host holds it until the
step commit instead of writing it as a live reply.

## The events block

The conversation hears of what happened outside it through the events block, which goes before the
user's message on the next turn. The block lists memory that changed outside the conversation, the
user's answers to memory proposals, nixie's outages and restarts, the page events of a device that
did not wake the conversation, the conversation's own turns that failed and were retried, and the
warning that compaction is near, each after its time, oldest first, up to a cap and then a count of
the rest. One exception: a kind whose notice no later note gives again, such as the compaction
warning, lists every event outside the cap. A turn after which nothing happened gets no block. The
block reads a range of the log, from the sequence the last turn's note covered to the log's head, so
the next turn's note starts where this one ends and no event appears twice.

Each kind of event is one entry in a registry: its name, how it reads its events in a range of the
log, and how one event's line renders. The block merges every entry's events by sequence, so a new
kind is a new entry and no change to the block. An entry may also complete the events the block
lists, such as by reading text through recall. The block asks for that only after its cap, because a
recall records what it delivered and the block must never record an event it leaves out. The server
builds the registry when the conversation starts, and each entry's package owns the records it
reads.

- **A note forget** reads each `notebook.note_forgotten` record that the user made as a line such as
  "Sam forgot note n4w8k2c6rd", with the user's name, or with the literal text "the owner" when none
  is set, as the session prompt does. A record that the assistant made adds no line. The
  [notebook](../memory/notebook.md) owns the entry, and the server registers it only when
  `forget_notices.note` is on.
- **A memory change** and a merge into one of the conversation's proposals are memory's own kinds. A
  memory change is an item that anything but the conversation itself wrote, such as an edit in the
  memory view. Each item lists once, at its latest version in the block's range, with its current
  text. An item the lapse sweep retired lists as lapsed, with the end time it was set to last until
  in the block's zone, so the model reads that its time ran out and that no one chose to retire it.
  A merge names each of the conversation's pending proposals that another source proposed again, so
  the conversation knows its proposal merged and still waits. The block reads a listed item's text
  through a recall marked as a turn note's, and only after its cap, so the recall records no item
  the block leaves out. Memory's kinds leave out an item that a forget has begun before the block
  applies its cap, so a forgotten item never takes the place of a later event. The recall checks
  again, because a forget can begin between the read and the recall.
- **A proposal answer** reads each proposal the user approved or rejected, from any source, the
  conversation's own included. A listed approval quotes the version it wrote while that version is
  still current, through a recall of that version alone. The recall record then names only the text
  the block shows, which the forget and the retirement gate's read check trust. A rejection quotes
  only the conversation's own proposed edit, which its session already holds. The store reads that
  edit under the delivery lock and only while its item is active or retired, so no text reaches the
  model once a forget of the item began. A rejected new item has no quote, because the rejection
  removes the item's key and its text with it. A rejection with the user's reason quotes the reason
  after any proposed text, so the conversation learns what to stop proposing. The block reads the
  reason from the rejection record's own erasable fields, and a record whose key is gone gives no
  reason.
- **An outage** reads each `server.started` record whose gap before the process started passed the
  `server.outage_notice_minutes` setting, so a normal restart or deploy adds no line. The line reads
  "nixie was down from {time} to {time}." The server writes a heartbeat file with the time every 30
  seconds, which survives a crash. At the next start it reads the file for the down time and takes
  the process's start for the up time, and a data directory with no heartbeat gives no outage. The
  event sits at the log position of the last record from before the down time, so the line lists
  before every event that queued during the outage, and it is uncapped, so ten earlier events never
  hide it. The kind is session-bound: a rebuilt or compacted session's replay of recent turns leaves
  it out. Each start is read once, because the block's range begins where the last turn's note
  ended, so a later turn never repeats the line. Telling the user about the outage is not part of
  this entry.
- **A page event** reads each `device.page_event` record that has no wake, because the page did not
  ask for one or the server did not grant it. The line names the device and the region, then shows
  the event's name and data inside the markers of an untrusted page read, because the page's text is
  outside content. An event that woke the conversation reaches it through its inbox, so the block
  leaves it out. An entry names the source of its events, and a block that lists one of them adds
  that source, `outside` for a page event, to the step's policy frame. A page event that woke a
  step, in its opening batch or while it ran, adds the same source.
- **A restart** reads the record the server writes at each start, with nixie's version and the
  version of the start before it. When the conversation's tools or persona changed since the start
  before, a second line names each tool added or removed and says when the persona was updated,
  because a version number alone tells the conversation nothing it can act on. The server finds
  those changes by comparing what each start gives the conversation, so a release that changes
  nothing the conversation is given adds no line.
- **A retried turn** reads each failure of a conversation step that the task retries on its own, and
  quotes the error when the log still holds its text. One exception: a turn the model API refused is
  listed without the error, which [a refused call](#a-call-the-model-api-refuses) keeps out of the
  conversation. A failure that waits for the user is not a retry, so the block leaves it out. The
  block also leaves out a one-off failure whose retry may still fix it, so a failure that the next
  try fixes never reaches the conversation. The block lists a failure when its record counts more
  than one error in a row ([steps](./tasks.md#steps)), when the conversation's next failure does, or
  when the conversation's previous failure came within the hour before it. The event log and the
  client keep every failure.
- **A compaction heads-up** reads the first turn of a session that ended near the compaction
  threshold, and gives the tokens left, as [compaction](./compaction.md#the-heads-up) describes.

Each line shows its time in the zone that [the time tool](../connectors/time.md) answers in, which
is the zone of the user's newest message. Each line names the user by the name in the owner section
of the deployment configuration, or calls the user "the owner" when the section sets none.
