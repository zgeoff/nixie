// Task definitions: how a caller uses each piece.
// A sketch. Nothing compiles it and no package imports it.
// The sketches hold the shapes and the exact texts. The docs hold the rules.
// A place marked `(open: <name>)` is not settled: see ../../open/definitions.md.
// Types: 02-types.ts. Flows: 03-flow.ts.

// ---- A. A definition folder in the definitions repo ----

// tasks/water-the-tomatoes/task.yaml
//
//   name: Water the tomatoes
//   brief: Read what memory holds about the garden and say what needs water this week.
//   trigger:
//     schedule:
//       every: week
//       on: fri
//       at: "08:00"
//   tools:
//     - memory.recall
//   report: wake
//
// tasks/water-the-tomatoes/instructions.md   optional
//
// A reminder needs no task. Only name, brief, trigger and enabled are allowed:
//
// tasks/dentist/task.yaml
//
//   name: Dentist
//   brief: Call the dentist about the check-up.
//   target: conversation
//   trigger:
//     at: "2027-03-09T14:00:00+11:00"

// ---- B. The seed calls the 2 hooks ----

// Inside the seed's transaction, after every refusal, in this order, before the `unchanged`
// return (03-flow.ts, section A):
const bound = writeDefinitionTasksInTransaction(tx, tasksContext, [
  { definitionID: 'water-the-tomatoes', definitionHash: 'h1' },
]);

// -> { created: 1, set: 0, withdrawn: 0 }

const armed = writeArmedDefinitions(tx, log, {
  definitions: snapshotHash,
  inForce: [
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'h1',
      source: 'schedule',
      target: 'task',
      trigger: { schedule: { every: 'week', on: 'fri', at: '08:00' } },
    },
    {
      definitionID: 'dentist',
      definitionHash: 'h2',
      source: 'schedule',
      target: 'conversation',
      trigger: { at: '2027-03-09T14:00:00+11:00' },
    },
  ],
});

// -> { armed: 2, withdrawn: 0 }

// ---- C. What the server app wires ----

// Into the tasks context, both required, so the tasks module imports neither the definitions
// module nor the trigger core:
const tasksContext = createTasksContext({
  readDefinitionVersion, // from the definitions module
  readDefinitionRunPolicy, // from the definitions module
});

// Into the trigger core, so no cycle forms:
const triggerCore = createTriggerCore({
  readDefinitionTask: readDefinitionTaskInTransaction, // from the tasks module
  retireOneShot: retireOneShotInTransaction, // from the definitions module
});

// Into the definitions module:
const definitionsContext = createDefinitionsContext({
  checkTaskStart, // wraps planTaskStart of the tasks family (open: seed starter)
  tasksContext, // for writeDefinitionTasksInTransaction (open: hook context)
  seedSource, // the seed of the definitions source
  holders: ['conversation'],
  branchOf: () => 'nixie/tasks',
});

// The server app starts each trigger source and stops it with the server.
// The names createTasksContext, createTriggerCore, createDefinitionsContext, checkTaskStart and
// seedSource stand in for built code and are this sketch's own.

// ---- D. A trigger source delivers ----

// The schedule source, once per tick:
await context.deliver({
  cursor: null,
  events: [
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'h1',
      kind: 'schedule',
      dedupeKey: 'water-the-tomatoes|2027-03-12T08:00',
      occurredAt: '2027-03-11T21:00:04.000Z',
      scheduledFor: '2027-03-11T21:00:00.000Z', // readNextFire gives epoch milliseconds
      payload: null,
      catchUp: { skipped: [], skippedCount: 0 },
    },
  ],
});

// -> { delivered: 1 }: one trigger.fired record on the task's thread, and the task wakes.

// A skip the source decided:
await context.deliver({
  cursor: null,
  events: [
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'h1',
      kind: 'schedule',
      dedupeKey: 'water-the-tomatoes|2027-03-12T08:00',
      occurredAt: '2027-03-12T09:30:00.000Z',
      scheduledFor: '2027-03-11T21:00:00.000Z',
      payload: null,
      catchUp: { skipped: [], skippedCount: 0 },
      skip: { reason: 'too_late', scheduledFor: ['2027-03-11T21:00:00.000Z'], count: 1 },
    },
  ],
});

// A test of the task of a definition fires a trigger with no source: it writes the
// trigger.fired record on the task's thread.

// ---- E. The conversation defines a task ----

const defined = await tools['task.define']({
  name: 'Water the tomatoes',
  trigger: { schedule: { every: 'week', on: 'fri', at: '08:00' } },
  target: 'conversation',
  brief: 'Water the tomatoes.',
});

// -> {
//      definitionId: 'water-the-tomatoes',
//      rendered: 'every Friday at 08:00',
//      next: 'Fri 13 Mar',
//      changeId: 'c7k2',
//    }
// The notice on the conversation's thread:
//   "Scheduled: Water the tomatoes, every Friday at 08:00 (next: Fri 13 Mar). [Undo]"

// A change in place. One change then holds the version before it, and an undo can restore it:
await tools['task.define']({
  definitionId: 'water-the-tomatoes',
  name: 'Water the tomatoes',
  trigger: { schedule: { every: 'week', on: 'sat', at: '09:00' } },
  target: 'conversation',
  brief: 'Water the tomatoes.',
});

// A one-shot. An `at` without an offset is read in your zone and stored with the offset:
await tools['task.define']({
  name: 'Dentist',
  trigger: { at: '2027-03-09T14:00' },
  target: 'conversation',
  brief: 'Call the dentist about the check-up.',
});

const listed = await tools['tasks.definitions']({});
// -> { definitions: [{ definitionId, name, enabled, trigger, rendered, target, tools, next,
//                      origin }] }

const removed = await tools['task.undefine']({ definitionId: 'water-the-tomatoes' });
// -> { definitionId: 'water-the-tomatoes', changeId: 'd3m9' }

// ---- F. You undo a change ----

// The [Undo] of a notice calls the API. No tool reaches it.
const undone = await api.definitions.undo({ changeID: 'c7k2' }); // a change ID or a short ID
// -> { definitionID: 'water-the-tomatoes', changeID: '...' }
// -> also `restored: 'repo'` in the conflict row of the undo table (open: undo output)

// You resolve a conflict from the command line:
//   nixie definitions resolve water-the-tomatoes --keep nixie
//   nixie definitions resolve water-the-tomatoes --keep repo

// ---- G. The web client reads the views ----

const finished = await api.tasks.listFinished({ limit: 50 });
// -> { tasks, runs: FinishedRun[], next }
const report = await api.triggers.report({ since: '2027-03-01' });
// -> { entries: [{ definitionID, name, kind: 'skipped', scheduledFor, reason: 'task_held', ... }] }
const definitions = await api.definitions.listTasks();

// -> { definitions: [{ definitionID, name, rendered, next, origin, createdBy, taskID, ... }] }

// The client follows records.follow for trigger.fired, trigger.skipped and definition.changed.

// ---- H. A suite makes a schedule due ----

// On a spawned nixie, a definition on `{ minutes: 5 }` with a scripted model:
await harness.advance(300_000);
// The schedule source fires, the task run reports, and the report reaches the conversation as a
// task message. This is how any suite makes a schedule due.
