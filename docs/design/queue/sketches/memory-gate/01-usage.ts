// Memory gate: how a caller uses each shape. Not compiled. No package imports this file.
// Types and texts: 02-types.ts. Flows: 03-flow.ts. Every text here is invented.

// ---- A. The conversation saves a memory with a typed quote ----

// You typed "my dentist is on Marsh Lane" in one of your last messages.
const rememberInput = {
  text: "Sam's dentist is on Marsh Lane.",
  quote: 'my dentist is on Marsh Lane',
};

// Every check passes: nixie writes the version, its record and the notice entry.

// ---- B. A text write that carries labels ----

const rememberWithLabels = {
  text: "Sam's dentist is on Marsh Lane.",
  quote: 'my dentist is on Marsh Lane',
  gist: 'Dentist: Marsh Lane',
  topic: 'health',
  triggers: ['dentist', 'toothache'],
};

// The gate checks the 3 labels with the text. The checker gets the text and never a label.

// A trigger with a link that the quote does not hold:
const rememberWithLink = { ...rememberWithLabels, triggers: ['dentist', 'marshlane.example/book'] };

// Result: "token_missing: Saved as a proposal for Sam to review. ..." (02-types.ts, section B)

// ---- C. A label-only edit ----

const labelOnlyEdit = {
  target: 'm4k9', // the short ID of the item's version, as memory.recall shows it
  gist: 'Dentist on Marsh Lane, Tuesdays',
};

// Always a proposal, from the conversation and from a task. Result: 02-types.ts, section C.
// The proposal's checks hold { tokens: 'pass' }: the item's text holds every token of the gist.

// ---- D. A task with the log grant cites your message ----

// The task holds `log: conversation`, `log.read` and `memory.remember`. Its `log.read` returned
// your message with the eventID 4127.
const grantedSave = {
  text: "Sam's dentist is on Marsh Lane.",
  quote: 'my dentist is on Marsh Lane',
  eventID: '4127',
};

// The gate reads event 4127 on the conversation's thread and runs the same checks as for the
// conversation. Every check passes: nixie writes the version with the origin 'task'.

// The same save with no eventID is a proposal with `no_quote`.

// ---- E. A start that gives a task a memory write tool ----

const startInput = {
  memory: 'read',
  tools: ['memory.recall', 'memory.edit'],
};

// Planned when the starter holds `memory.edit`.

// A definition's `task.yaml` gives the same 2 keys. Its starter holds every registered tool.

// ---- F. The config keys of the gate ----

// config.yaml, the section `memory`:
//
//   memory:
//     evidence_window: 20   # how many of your last messages the gate reads
//     proposal_cap: 10      # the proposals of one turn

// ---- G. The config that the delete release refuses ----

// nixie refuses to start on a config.yaml that holds any of these keys, whatever each holds:
//
//   memory_writer: ...
//   memory_consolidation: ...
//   models:
//     roles:
//       memory-writer: ...
//       memory-consolidator: ...
//
// The seed refuses a nixie.yaml that holds either of these:
//
//   prompts:
//     writer: ...
//     consolidator: ...

// ---- H. The config constant of a rollback ----

// One shared test constant. A release that holds the built-in tasks reads a missing section as
// `enabled: true`, so a rollback to such a release sets exactly this first.
const builtInMemoryTasksOffConfig = `
memory_writer:
  enabled: false
memory_consolidation:
  enabled: false
`;

// ---- I. The steps of the 2 leftover tasks ----

// In the server's map from a system task ID to its step:
const systemSteps = new Map([
  [conversationTaskID, runConversationStep],
  [memoryWriterTaskID, runOffTaskStep],
  [memoryConsolidatorTaskID, runOffTaskStep],
]);
