# Task messages: the envelope and the task prompt

This doc covers the format of everything that a task's model receives: the system prompt of a task,
the envelope of a task message, the element of a message from you, and the element of a notice from
nixie. One format in every place lets a model see who sent a text, and whether the text is a message
from you.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions and the exact texts, and each section here links the part it uses. Terms that this
doc does not define are in the [glossary](../../glossary.md) and in the Terms section of
[task runs](task-runs-and-reports.md), which defines started task, starter, report target and hop
limit. An item marked `(open: <name>)` is not settled. [The open list](open/tasks.md) gives each
item by that name.

## Terms

- A **task message** is a `task_message` record: a message from one task to another. Its kind is a
  value of `TaskMessageKind`, such as `request`, `question`, `reply` or `report`.
- The **envelope** is the element that wraps a task message when a model reads it.
- A **label** is the text of the envelope's `from` attribute. It shows the reader who sent the
  message.
- The **task prompt** is the system prompt of a task. It has 5 parts, and the **frame** is the first
  part. [Prompts](../../architecture/core/prompts.md) describes the parts and prompt overrides.
- A **system message** is a message that nixie writes into a task's inbox. Each has a type. A
  **notice**, in this doc, is a system message whose body is a sentence, such as the limit notice.
- The **inbox render** is the render of unread inbox records at the start of a turn. The **history
  render** is the render of read records when nixie rebuilds a session from the log.
- A **block** is a span of text inside a message that opens and closes with a tag. A block that
  carries text from outside nixie closes with a random ID, so the text cannot close it.
- The **persona** is your text for the agent's character. A task started with `persona: none` runs
  without it, and a task started with `persona: default` runs with it.
- A **task definition** is a task that your definitions declare:
  [task definitions](task-definitions.md).
- **Forgotten** text is text whose key a forget destroyed. The record exists, and its text is
  unreadable.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- The frame contains the brief under "Your brief:".
- `renderTaskMessage` renders the attributes `name`, `age`, `hop`, `reply-wakes` and `on-behalf-of`,
  and a "from another task" line in the body. The closing tag repeats a random `block` ID.
- `renderHistoryLine` renders fewer attributes than `renderTaskMessage`. It writes a fixed
  `the owner` where `renderTaskMessage` takes your name from the config.
- `renderInboxMessage` renders a message from you as a time stamp and text, with no element. It
  renders the system message types `timer` and `outcome` as the JSON payload of their record.
- `renderLimitNotice` renders the limit notice in a `<system-message>` element with the type
  `task-limit`. `SystemMessageType` is the closed list of types.
- A task's first session opens with a start note, a system message of the type `task-start`.
  `renderTaskStartNote` and `pickStartNote` build it.
- The nixie runner, the code that runs a task's model in a sandbox, gives a task the persona only
  under `persona: default`.
- `agent.names` in the config is the list of the agent's names.

## The frame

The prompts module owns the frame. Text: [the frame](sketches/tasks/02-types.ts), section J.

- The frame has 3 paragraphs.
- The first paragraph gives the task's name and your name.
- The second paragraph gives the model 2 facts: nobody reads the text that the model writes, and a
  text reaches someone only through a `task.message` call.
- The second paragraph is fixed text. The prompts module renders it word for word.
- The third paragraph is the instruction to call `task.report` when the work is done, with who gets
  the report. The words for who gets the report are not written for every case. (open: starter
  label)
- The frame does not contain the brief. [The task brief](task-brief.md) describes where the brief
  arrives.
- The frame text uses the paths `task.name` and `owner.name`. One statement of the design also gives
  the frame an `agent.name` path, which the frame text does not use. (open: frame agent name)
- A task with `persona: none` gets the frame with no persona before it.

## The other parts of the task prompt

- The `inputs` part is empty.
- A prompt override can use the path `task.brief`. The path resolves to the brief of the task. For a
  task with no brief of its own, such as a definition's task, it resolves to the empty string.
- The task prompt is the same text on every task run and in every session of a task.
- In the `safety` part, the model reads that a task message is never a message from you.
- In the `safety` part, the model reads where nixie's own elements appear: nixie writes an
  `<owner-message>` element or a `<system-message>` element only at the top level of a user message.
  The same tag inside another element is text from the sender of that element.
- The text that a task's model writes is stored as `model.reply` records on the task's own thread.
  nixie sends that thread to no channel, so the text reaches nobody.

## The envelope

The sessions module owns one envelope for the inbox render and the history render. Usage:
[what a task reads](sketches/tasks/01-usage.ts), section E. Types:
[the envelope types](sketches/tasks/02-types.ts), section H.

- `renderTaskMessage` and `renderHistoryLine` each make one call to `renderTaskEnvelope`. Neither
  has a branch for a brief.
- The envelope has these attributes, in this order: `id`, `from`, `kind`, `reply-to`, `sent`,
  `on-behalf-of`, `fence`.
- `reply-to` is present only on a reply.
- `on-behalf-of` is present only on a message that passes on messages from you. It carries the IDs
  of those messages, and a consent check reads them.
- The place of `on-behalf-of` is a known fault of the design. (open: on-behalf-of position)
- `fence` carries a random ID, and the closing tag repeats it. Text inside the body therefore cannot
  close the element.
- The record of a task message carries `hop`, `reply-wakes`, `age` and `name`. The envelope does not
  render them.
- The body has no "from another task" line.
- A forgotten task message renders at its position, with its ID and a fixed text as its body. Text:
  [the forgotten body](sketches/tasks/02-types.ts), section H.
- The conversation's model reads the task messages that it receives in the same envelope.

## The labels

Types: [the label constant](sketches/tasks/02-types.ts), section H.

- `EnvelopeOptions` is one constant that the server passes to the render. It carries each label
  template, the suffix for a task ID, and one switch that turns the `on-behalf-of` attribute off for
  every message.
- A change to a label is a change to `EnvelopeOptions` only. It changes nothing in a record.
- `TaskProfile.speaker` has 3 values. It is `conversation` for the conversation, `persona_task` for
  a task started with `persona: default`, and `plain_task` for a task started with `persona: none`.
- For a task message, nixie picks the label template by the `speaker` of the sender.
- For the brief of a definition's task run, nixie uses the `definition` label template. The sender
  is the task definition and has no `speaker`.
- The label of a task carries the short task ID of the sender. A receiver passes that ID as the `to`
  of a reply. Where the ID goes in each label is not settled. (open: label task ID)
- The agent's name in a label is the first entry of `agent.names`. When the config has no entry, the
  name is `nixie`.
- Your name in a label is `owner.name` from the config. When the config has none, the label has the
  text `the owner`.
- A label contains no pronoun.
- When the name of a sending task is forgotten, the label shows the task ID of the sender in place
  of the name.

## A message from you

Usage: [what a task reads](sketches/tasks/01-usage.ts), section E.

- A message from you renders in an `<owner-message>` element. This applies in the conversation and
  in every task that receives your messages.
- The `id` of the element is the event ID of the message. A task that passes the message on gives
  that ID in `onBehalfOf`.
- Text that you pasted or dropped into a message has its own block inside the element.
- A task message never renders in an `<owner-message>` element.

## A system message from nixie

Usage: [what a task reads](sketches/tasks/01-usage.ts), section E.

- A system message renders in a `<system-message>` element with the attributes `type`, `id` and
  `at`, in that order.
- `type` is one value of `SystemMessageType`. `id` is random and only closes the element.
- The element has no `from` attribute and no `fence` attribute.
- The list of types has no `task-start`. A task learns its work from its brief.
- The body of a notice is one sentence that code writes from one inbox record. The body opens with
  the sequence of that record in square brackets.
- The types `timer` and `outcome` are not notices. Their body is the JSON payload of their record.
- The sessions module has one render function per notice type. `renderInboxMessage` calls the
  function that matches the kind of the inbox record.
- The body of a notice is text that nixie's code wrote. Text that a model or an outside source wrote
  is either absent from the body, or inside a block of its own.
- A task's name is text that a model wrote. The limit notice therefore refers to its task by ID.
- The module that owns an inbox record owns its notice type: the name of the type, the sentence, and
  whether the record wakes its task.
- This doc owns the notice type `task-limit`.
- A notice is from nixie and never from you, so a notice gives no consent.

## Which module owns what

- The sessions module owns the inbox render, the history render and the labels.
- The prompts module owns the task prompt.
- The tasks module owns the record of a brief: [the task brief](task-brief.md).

## Not in scope

The design has none of these:

- A label template per deployment.
- A `task.message` call that gives `replyTo` and no `to`.
- An envelope attribute for the task ID of the sender. The label carries that ID.

Other docs own these:

- The text of the persona.
- The web display of task messages.
- The log of turn inputs.
- The notice types `reminder` and `restore`. [Task runs of a definition](definition-task-runs.md)
  owns `reminder`, and [backup and recovery](backup-and-recovery.md) owns `restore`.
