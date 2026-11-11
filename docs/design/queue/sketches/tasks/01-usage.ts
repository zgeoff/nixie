// Tasks: how a caller uses each shape. Not compiled. No package imports this file.
// Types: 02-types.ts. Flows: 03-flow.ts. The sketches hold the shapes and the exact texts. The
// docs hold the rules.

// ---- A. A task ends its task run with task.report ----

// A task with no report shape: a summary alone.
task.report({ summary: 'Read the 3 pages. The second one has the opening hours.' });

// → { reportID: "r8d2" }

// A task whose start or definition declares a report shape: the summary and the fields.
task.report({
  summary: 'Read the 3 pages. The second one has the opening hours.',
  fields: {
    pagesRead: ['https://cafe-list.test/north', 'https://cafe-list.test/station'],
    confidence: 'medium',
  },
});

// ---- B. A start or a definition declares a report shape ----

// In a task.start call, `reportShape` sits beside `report`, which keeps the mode.
task.start({
  name: 'Cafe hours',
  brief: 'Read the 3 cafe pages and report the opening hours.',
  report: 'next_turn',
  reportShape: {
    properties: {
      pagesRead: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      openingHours: { type: 'string', maxLength: 400 },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['pagesRead', 'confidence'],
  },
});

// In a definition file, the same 2 keys of the start input. The file and its other keys:
// task-definitions.md.
//
//   # tasks/cafe-hours/task.yaml
//   report: next_turn
//   reportShape:
//     properties:
//       pagesRead: { type: array, items: { type: string }, maxItems: 20 }
//       openingHours: { type: string, maxLength: 400 }
//       confidence: { type: string, enum: [low, medium, high] }
//     required: [pagesRead, confidence]

// ---- C. The report that reaches the target ----

// The body of the delivered task_message and of task.run_ended, as YAML:
//
//   report:
//     summary: "Read the 3 pages. The second one has the opening hours."
//     fields:
//       pagesRead: ["https://cafe-list.test/north", "https://cafe-list.test/station"]
//       confidence: medium

// ---- D. A call cap in a definition file ----

//   maxCalls:
//     moment.edit: 3
//
// The 4th call of the task run gets: "This run has used its 3 calls to moment.edit."

// ---- E. What a task reads: the message envelope ----

// A request from the conversation, and a reply from a task with the persona:
//
//   <task-message id="m7k2" from="Pip, in the chat with Rowan" kind="request" sent="Thu 5 Nov, 17:39" fence="61e4">
//   Find 3 quiet cafes near the station and say which opens earliest.
//   </task-message fence="61e4">
//
//   <task-message id="p3x9" from="Pip (task: Cafe search, t4m2)" kind="reply" reply-to="m7k2" sent="Thu 5 Nov, 17:41" fence="a90c">
//   The one on Mill Lane opens at 6.
//   </task-message fence="a90c">
//
// (open: label task ID) The first label holds no task ID.

// Your message, in the conversation and in any task that takes your messages:
//
//   <owner-message id="16022" from="Rowan" sent="Thu 5 Nov, 18:02">
//   Any of them have outdoor seats?
//   </owner-message>

// A notice from nixie:
//
//   <system-message type="task-limit" id="7c1e" at="Thu 5 Nov, 18:10">
//   [#16040] Task t4m2 paused at its limit: it used 40 of its 40 turns and $3.10 of its $10.00.
//   </system-message id="7c1e">

// ---- F. A start grants the conversation's thread ----

task.start({
  name: 'Note taker',
  brief: 'Read the messages since the previous task run and save what is worth keeping.',
  memory: 'read',
  log: 'conversation', // default 'own'
  tools: ['log.read', 'memory.remember', 'memory.edit'],
});

// From a starter without the grant, the start is refused with:
// "You can give a task the conversation's log only when you hold it yourself, and you do not."

// ---- G. A message to an asleep task ----

task.message({ to: 't9q1', kind: 'question', body: 'Did the weekly digest go out?' });

// The receiver is not wakeable, waits, and has no task run open. The tool's note:
// "{name} is asleep and reads this at its next run. A reply, if any, arrives as a new message."

// ---- H. A caller runs a worker ----

worker.run({
  question: 'Read https://cafe-list.test/north and list each cafe with its opening time.',
  tools: ['web.fetch'],
});

// → { workerRunID: "w3k8", answer: "...", used: { minutes: 0.4, turns: 3, tokens: 18250, dollars: 0.06 } }

// ---- I. The config keys of a worker ----

//   models:
//     limits:
//       workerRun: { minutes: 10, turns: 25, tokens: 2000000, dollars: 2 } # the defaults; a strict object
//   tasks:
//     workerRuns: { max: 2, whenFull: wait } # optional, and no key has a default; absent: no cap

// ---- J. The server builds the runner registry ----

const registry = buildTaskRunnerRegistry({
  // The last 2 are definitions of the leftover tasks `memory-writer` and `memory-consolidator`.
  // Each has one fixed task, no start, and the step that only empties the inbox, which the memory
  // family's delete of the 2 built-in memory tasks supplies.
  definitions: [
    conversationRunner,
    nixieRunner,
    queueCheckRunner,
    leftoverMemoryWriter,
    leftoverMemoryConsolidator,
  ],
  defaultRunner: nixieRunner, // runs a started task whose record holds no `runner`
});

const runStep = registry.bindSteps(
  context,
  [
    { definition: conversationRunner, runStep: runConversationStep },
    { definition: nixieRunner, runStep: runNixieStep },
    // one bound step per definition
  ],
  fallbackStep, // the test step or the unknown-task step
);
// Both claim pools run `runStep`.
