# Task messages

A task message is a record that one task writes to another task's thread through the message tool.
It lands in the receiver's inbox, and it wakes the receiver unless its sender sent it with no wake
or the hop limit held it back. A question or a request can open a message wait, in which the sender
waits on the receiver until a reply answers it. The tasks module owns the message tool, the list
tool, the hop count and the waits.

[Tasks](./tasks.md) covers the inbox, steps and started tasks.
[Conversation turns](./conversation-turns.md) covers the block that shows a task message to the
model, and [memory writes](../memory/writes.md) covers why the content gate never takes its body as
the user's words.

## Sending a message

The list tool shows a task the directory: each task it can message, with its brief and whether a
message wakes it. The server builds the directory's built-in tasks from the deployment config, and
each tool call and each conversation step adds the [started tasks](./tasks.md#started-tasks) from
the log, so a task the conversation started a moment ago takes messages at once.

The conversation wakes for a message. The [memory writer](../memory/writer.md) and the
[consolidator](../memory/consolidation.md) run on their own schedule, so a message to either waits
unread until its next scheduled session reads it, and that session marks it read. The message tool
refuses these, with the refusal as the tool's answer:

- a message to the sender itself;
- a message to a task outside the directory, or to one that has finished;
- a reply to an unknown message;
- an on-behalf-of ID that is not one of the user's messages.

The record's body is erasable.

A message write checks the sender's lease in its own transaction, as a step commit does. The tool
call carries the ID of the step that made it, and the write refuses the call when the task has
started another step, its lease has moved to another
[generation](./leases-and-recovery.md#the-claim-path), or the lease has expired. A step that lost
its task therefore wakes nobody and changes no message wait. The memory writer and the consolidator
open each session under a token for the step that runs it, so their calls carry that step's ID too.

## The hop limit

Each step carries a hop count and the cause that woke it, which the claim works out from the unread
waking records and stores on the step's start. A step woken by the user, a timer or an outside event
is hop 0, a step woken by task messages takes the lowest hop among them, and a step with no new
input carries the hop of the step before. A message is its step's hop plus 1. A message past the hop
limit, a setting of the tasks config, still lands in the receiver's inbox but wakes nobody, and the
tool tells the sender so in a note. The first such message in a step also writes an exchange notice
on the sender's thread for the user to see. The notice names both tasks, the count, and which of
them waits on the other.

A message that wakes nobody starts no step, and a step never counts it as unread work that makes the
task ready, so such messages never loop the receiver through empty steps. The receiver reads them in
its next step. In that step, the messages that the hop limit held back appear under one summary line
per sender, which counts them and shows whether a reply would wake the sender. A message that its
sender sent with no wake gets no summary line. A conversation turn that is already running receives
a message at once, as it receives every inbox record that lands during the turn, so the read cursor
never meets a gap. That turn keeps the hop it was claimed with, so a reply from it wakes the sender
only when the turn's own hop allows.

## Message waits

A task-messages projection keeps one row per message with its wait state. A question or a request to
a task that wakes for messages opens a message wait, and any other message opens none. The tasks
module checks each move between wait states against one table. A question or a request to the memory
writer or the consolidator opens no wait, because neither task finishes, so its wait would stay open
until a reply that may never come. The tool's note tells the sender that a reply, if any, arrives as
a new message. The message record holds whether the message opens a wait, so a rebuild of the
projection keeps each wait as it was. A message record with no such field opens a wait for every
question and request.

A reply that names the question answers that wait. A step that commits as done, a task that fails,
and a close release every open wait that names the task, and a stop releases the waits the stopped
task has open on others. Only an open wait moves, so an answered wait stays answered when its task
finishes. The list tool reads the newest open wait as the task it waits on.
