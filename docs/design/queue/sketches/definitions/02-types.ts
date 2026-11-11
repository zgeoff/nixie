// Task definitions: every agreed shape.
// A sketch. Nothing compiles it and no package imports it.
// The sketches hold the shapes and the exact texts. The docs hold the rules.
// A place marked `(open: <name>)` is not settled: see ../../open/definitions.md.

// Types that other work owns, named here only so the shapes read:
//   TaskStartInput, ReportShape, FinishedRun   the tasks family (../../task-runs-and-reports.md)
//     TaskStartInput is what parseTaskStartInput of the tasks family accepts. Built code has only
//     the unexported `startArguments` (open: start input schema).
//   PollFilter                                  the poll sources
//   TriggerSource, TriggerContext, TriggerEvent the trigger source design
//   JSONValue, PullRequestRef, RuntimeChangeState, DefinitionsChangeKind   built code

// ---- A. The definition folder and `task.yaml` ----

// tasks/<id>/task.yaml       required
// tasks/<id>/instructions.md optional
// tasks/<id>/<name>.ts       allowed only when `step.file` names it
//
// <id>: lowercase letters, digits and hyphens, at most 64 characters, as a skill's name is.
// Under tasks/ a source reads only .yaml, .md and .ts files.

type TaskDefinition = TaskStartInput & DefinitionOnly;

type DefinitionOnly = {
  enabled?: boolean; // default true
  trigger?: Trigger;
  target?: 'task' | 'conversation'; // default "task"
  context?: 'fresh' | 'continuing'; // default "fresh"
  wakeable?: boolean; // default false. Meaning: ../../task-wake.md
  // `runner`: whether a definition holds this key is not settled (open: runner key)
  maxCalls?: Record<string, number>; // each key is a name in `tools`
  skills?: string[]; // (open: skills key)
  step?: { file: string; api: 1 };
};

type Trigger = { schedule: Schedule } | { at: string } | { poll: PollFilter };

// The schema is strict. These 4 are unknown keys and the seed refuses each:
//   `role`, `inputs`, `reportFields`, and a `log` trigger.
// `TaskStartInput` holds `log` ("own" | "conversation") and `reportShape`. `task.yaml` accepts
// both, and the seed checks both through the start bounds.

// ---- B. `Schedule` and the one-shot `at` ----

type Schedule = {
  every: 'day' | 'week' | 'hour' | { minutes: number }; // minutes: a whole number, 5 to 1440
  at?: string; // "HH:MM", 24-hour. Required for day and week unless `window` is set.
  //              Refused for hour and minutes.
  on?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; // required for week, else refused
  window?: { from: string; until: string }; // "HH:MM" each. day and week only. Refused beside
  //                                           `at`. `until` before `from` crosses midnight.
  idleMinutes?: number; // a whole number, 1 to 720. Needs `window`.
  zone?: 'owner' | string; // an IANA zone name. Default "owner": the zone of your newest
  //                          message, or the config key `time.default_zone` without one.
  catchUp?: 'once' | 'skip'; // default "once"
};

// Trigger `at`: an ISO 8601 date and time with an offset or `Z`. The seed refuses a value
// without one. `task.define` reads a value without one in your zone and stores it with the offset.

// ---- C. What the seed refuses ----

// Each refusal names the file and the fault. The exact sentences are not written
// (open: refusal text). The faults:
type SeedFault =
  | 'a tasks/<id>/ folder with no task.yaml'
  | 'an ID outside the pattern'
  | 'an unknown key'
  | 'a .ts file that no `step` key names'
  | 'a `step` key on a runner other than `nixie`' // (open: runner key)
  | 'any key but name, brief, target, trigger and enabled on a `target: conversation` definition'
  | 'a `target: conversation` definition with no trigger'
  | 'a `maxCalls` key that `tools` lacks' // the check: ../../task-run-limits.md, call caps
  | 'a slot in instructions.md outside the paths the `task` prompt accepts' // trigger.* and
  //                                                              inputs.* are no slots
  | 'a `poll` trigger' // the error names the trigger; until the poll sources exist
  | 'a name in `skills` that the seed does not hold' // (open: skills key)
  | 'a Schedule key outside its rule in section B'
  | 'a trigger `at` with no offset'
  | 'every fault planTaskStart refuses for the same input'; // sentences: the tasks family.

//   The starter and the bounds the seed passes: (open: seed starter)

// ---- D. The definition hash, the version store and the snapshot ----

// The hash covers:
//   1. the canonical JSON of the parsed task.yaml with defaults filled;
//   2. the hash of instructions.md after the normalisation the persona gets;
//   3. the hash of the step file.
// A comment in task.yaml does not change it. A change of instructions.md does.

// Table `task_definition_versions`: keyed by the definition hash. One appended migration. nixie
// never deletes a row. `skill_versions` has the columns skill_hash, name, frontmatter, files. The
// columns here are not written (open: version table columns). Intended, after
// StoredTaskDefinition (section J):
//   definition_hash  text, primary key
//   definition_id    text
//   form             text, the parsed definition as JSON, defaults filled
//   files            text, a JSON object of path to exact text

type SnapshotTasks = Array<
  | { id: string; hash: string; origin: 'definitions' }
  | { id: string; hash: string; origin: 'nixie'; changeID: string }
>; // sorted by id. Replaces `jobs: []` in the snapshot form.

// definitionsLayout.folders holds `tasks` and does not hold `jobs`.
// definitionsFormats.tasks = 4. A release reads formats 3 and 4.
// isDefinitionsPath: under tasks/, only .yaml, .md and .ts.

// ---- E. The record kinds of a definition's task ----

// task.definition_set: on the task's own thread. No inbox kind. No erasable field.
// The one record that binds a definition ID to a task, and the one record that says which version
// is in force for that task. One writer: writeDefinitionBindingInTransaction.
type TaskDefinitionSet = {
  taskID: string;
  definitionID: string;
  definitionHash: string | null; // the version in force; null when disabled or removed
};

// The `task.created` record of a definition's task holds exactly this, and no starter, no
// options and no brief. The taskID is a short ID from createShortID.
type DefinitionTaskCreated = { taskID: string; isConversation: false; state: 'waiting' };

// trigger.fired: an inbox record that wakes its task. Wake cause: "event". It is one of the inbox
// kinds of isInboxRecord. On the thread of the definition's task, or on the conversation's thread
// for `target: conversation`. The payload of a poll event rides in the erasable fields, as
// outside content.
type TriggerFired = {
  definitionID: string;
  definitionHash: string; // the version this task run pins
  source: string; // the trigger source's id, such as "schedule"
  dedupeKey: string;
  kind: 'schedule' | 'at' | 'poll';
  scheduledFor: string | null; // ISO instant; null for poll
  firedAt: string;
  isCatchUp: boolean;
  skipped: string[]; // scheduled instants skipped since the last fire, oldest first, at most 20
  skippedCount: number;
};

// trigger.skipped: never an inbox record. Same threads as trigger.fired.
// No reason `disabled` exists: nixie writes no record for a fire of a disabled definition.
type TriggerSkipped = {
  definitionID: string;
  source: string;
  scheduledFor: string[]; // at most 20; the last entry is the newest
  count: number;
  reason: 'too_late' | 'catch_up_off' | 'window_closed' | 'still_running' | 'task_held';
  recordedAt: string;
};

// ---- F. The tasks projection and the functions of the tasks module ----

// One appended migration adds to the `tasks` projection:
//   definition_id    text, nullable. Unique index where it is not null. Set once, never cleared.
//   definition_hash  text, nullable.
// Only task.definition_set folds into them.

// The seed hook. `inForce` holds each enabled definition with `target: task`, with or without a
// trigger, less each spent one-shot.
declare function writeDefinitionTasksInTransaction(
  tx: Transaction,
  context: TasksContext,
  inForce: Array<{ definitionID: string; definitionHash: string }>,
): { created: number; set: number; withdrawn: number };

// The one writer of task.definition_set.
declare function writeDefinitionBindingInTransaction(
  tx: Transaction,
  context: TasksContext,
  binding: { definitionID: string; taskID: string; definitionHash: string | null },
): { status: 'bound' | 'unchanged' } | { status: 'refused'; reason: string };

// What the server app passes to the trigger core as `readDefinitionTask`. Null: no task is bound.
declare function readDefinitionTaskInTransaction(
  tx: Transaction,
  definitionID: string,
): { taskID: string; fire: 'take' | 'still_running' | 'held' } | null;

// Every bound task, in force or not, for a forget's session cleanup.
declare function readDefinitionTaskIDs(context: TasksContext): string[];

// Pure. Input: the task's row, its unread inbox records, its control records, its last task run.
declare function pickRunDefinition(input: RunDefinitionInput): RunDefinitionPick;

// `open` uses the values of `origin.kind` that ../../task-runs-and-reports.md owns.
type RunDefinitionPick =
  | { open: 'trigger'; definitionHash: string; triggerKey: string }
  | { open: 'message'; definitionHash: string }
  | { open: 'raise' | 'restart'; definitionHash: string; carriesRunID: string }
  | { open: null }; // rest

// The member names of RunDefinitionInput and RunDefinitionPick are this sketch's own
// (open: undefined types).

// The 2 readers the server app passes from the definitions module into the tasks context. Both
// are required. The member names are settled; the member types are this sketch's own
// (open: undefined types).
declare function readDefinitionVersion(definitionHash: string): {
  definitionID: string;
  name: string;
  brief: string;
  instructions: string;
  model: string;
  profile: string;
  persona: string;
  memory: string;
  log: 'own' | 'conversation';
  tools: string[];
  context: 'fresh' | 'continuing';
  wakeable: boolean;
  // no `skills` member (open: skills key)
  // no `runner` member (open: runner key)
} | null;

// Takes the pinned hash beside the task ID: a fire's version can leave force before its claim.
declare function readDefinitionRunPolicy(
  taskID: string,
  definitionHash: string,
): {
  report: string | null; // the report mode the definition declares, or null. pickReportMode of
  //                        the tasks family reads the default and the target.
  reportShape: ReportShape | null;
  wakeable: boolean;
  limits: Record<string, number>;
} | null;

// readTaskSetup returns the `definition` member of TaskSetup for a task with definition_id set.
// The tasks family owns the type: ../tasks/02-types.ts, section P. The member's definitionHash is
// the hash in force, or null.

// A close of a definition's task is refused with this reason:
type CloseRefusal = 'definition_task_never_closes';

// ---- G. Trigger details for the model, and the reminder ----

// Built by the claim from the trigger.fired record that opened the task run. Rendered as the
// first <input> block of the task run, named `trigger`. Never in the prompt.
type TriggerDetails = {
  kind: 'schedule' | 'at' | 'poll';
  scheduledFor: string | null; // local time in the zone of the definition's schedule, with offset
  startedAt: string; // the same form
  isCatchUp: boolean;
  skipped: string[]; // the same form, oldest first, at most 20
  skippedCount: number;
  sentence: string; // built by code from the fields above
};

// An example of `sentence`:
//   "This task run was scheduled for Thu 4 Jun, 06:30 and started at 08:15 as a catch-up.
//    Skipped: Wed 3 Jun, 06:30."

// A trigger.fired record on the conversation's thread renders as a system message of the type
// `reminder`, defined in the wire lib:
//   "Reminder you set: {brief}"
// with the scheduled time and, for a catch-up, how late it is. The wording of the time part is
// not written (open: notice text). The envelope: ../../task-messages.md.

// ---- H. The trigger core ----

// TriggerEvent holds the members the trigger source design gives it, and these 5:
type TriggerEventAdditions = {
  definitionID?: string; // the one definition the event is for. The schedule source sets it.
  //                        A poll event omits it.
  definitionHash: string; // the version the source computed the event from
  kind: 'schedule' | 'at' | 'poll';
  catchUp: { skipped: string[]; skippedCount: number };
  skip?: { reason: TriggerSkipped['reason']; scheduledFor: string[]; count: number };
  //      set for a skip the source decided
};

// trigger.armed: no thread, no erasable field. Written by the seed hook, in the seed's
// transaction, only when the definitions in force differ from the trigger_definitions rows.
// The one record that sets, changes or withdraws a pending fire.
type TriggerArmed = {
  armed: ArmedDefinition[]; // added, changed, or back in force
  withdrawn: string[]; // definition IDs that are disabled or removed
};

type ArmedDefinition = {
  definitionID: string;
  definitionHash: string;
  source: string; // "schedule" for `schedule` and `at`
  target: 'task' | 'conversation';
  trigger: Trigger;
};

// trigger.delivered: no thread, no erasable field. One per `deliver` call that took a key or
// changed the cursor.
type TriggerDelivered = {
  source: string;
  cursor: JSONValue; // null for the schedule source
  keys: string[]; // each dedupe key this batch took, fired or skipped
};

// 3 projections, in one appended migration:
//
// trigger_sources      key: source_id
//                      columns: cursor, updated_sequence
//                      folded from: trigger.delivered
// trigger_keys         primary key: source_key = "<source>\n<dedupeKey>"
//                      columns: sequence
//                      folded from: trigger.delivered. No row is ever removed.
// trigger_definitions  key: definition_id
//                      columns: source_id, definition_hash (null when withdrawn), target,
//                               trigger, after, updated_sequence
//                      folded from: trigger.armed, trigger.fired, trigger.skipped

// Functions of the triggers module:
declare function writeArmedDefinitions(
  tx: Transaction,
  log: Log,
  input: { definitions: string; inForce: ArmedDefinition[] }, // `definitions`: its type is
  //                                              this sketch's own (open: undefined types)
): { armed: number; withdrawn: number }; // idempotent: at most one record

declare function deliverTriggerBatch(
  context: TriggerCoreContext,
  sourceID: string,
  batch: { cursor: JSONValue; events: TriggerEvent[] },
): { delivered: number }; // what TriggerContext.deliver runs: one write transaction

declare function readNextFire(
  trigger: Trigger,
  after: number, // epoch milliseconds
  zone: string,
): { scheduledFor: number; dedupeKey: string } | null; // pure

declare function readArmedDefinitions(
  db: Database,
  sourceID: string,
): Array<ArmedDefinition & { after: number }>;

declare function readSourceState(db: Database, sourceID: string): { cursor: JSONValue };

// True when trigger_keys holds the dedupe key of this `at`.
declare function isSpentOneShot(db: Database, definitionID: string, trigger: Trigger): boolean;

// What the server app passes to the trigger core, beside readDefinitionTask:
declare function retireOneShot(
  tx: Transaction,
  definitionID: string,
  cause: 'one_shot_fired' | 'one_shot_skipped',
): void;

// Renders a trigger in plain words and its next fire, in the schedule's zone. Pure. Its name is
// not given (open: undefined types).
//   "every Friday at 08:00"   "every day at 06:30"   "every 45 minutes"
//   "once on Mon 9 Mar at 14:00"
declare function renderTrigger(
  trigger: Trigger,
  after: number,
  zone: string,
): { rendered: string; next: string | null };

// Source health: "running" | "unhealthy" | "stopped". Kept in memory, through reportHealth.

// Constants. Config keys: none. The values are settled; the names are this sketch's own
// (open: undefined types).
const TICK_SECONDS = 20;
const FAILURES_FOR_UNHEALTHY = 3; // in a row
const ON_TIME_SECONDS = 60;
const MINUTES_FLOOR = 5;
const MINUTES_TOP = 1440;
const SKIPPED_LIST_MAX = 20;

// ---- I. The chat tools ----

// The tools spell their IDs `definitionId` and `changeId`. The records and the API spell them
// `definitionID` and `changeID` (open: ID casing).

// task.define. Effect: schedule. Held by the conversation alone.
type TaskDefineInput = {
  name: string;
  trigger: { schedule: Schedule } | { at: string };
  target: 'conversation' | 'task';
  brief: string;
  model?: string;
  persona?: string;
  memory?: string;
  tools?: string[];
  report?: unknown; // as TaskStartInput gives it
  definitionId?: string; // names a definition to change in place
};

type TaskDefineOutput = {
  definitionId: string;
  rendered: string;
  next: string | null;
  changeId: string; // the change's short ID, which the notice's undo names
};

// tasks.definitions. Effect: read.
type TasksDefinitionsOutput = {
  definitions: Array<{
    definitionId: string;
    name: string;
    enabled: boolean;
    trigger: Trigger | null;
    rendered: string;
    target: 'task' | 'conversation';
    tools: string[];
    next: string | null;
    origin: 'definitions' | 'nixie';
  }>;
};

// task.undefine. Effect: schedule. Held by the conversation alone.
type TaskUndefineInput = { definitionId: string };

type TaskUndefineOutput = { definitionId: string; changeId: string };

// The keys only a file can set. A change that names a definition holding one of them at a value
// other than its default is refused with FILE_ONLY_KEYS.
type FileOnlyKey = 'context' | 'wakeable' | 'maxCalls' | 'step' | 'reportShape' | 'log';

// ---- J. The change records ----

// definition.changed: on the conversation's thread. The notice. One per task.define,
// task.undefine and undo, written in the transaction that puts the change in force.
type DefinitionChanged = {
  changeID: string; // random
  shortID: string; // from createShortID: what the model and the notice show
  definitionID: string;
  operation: 'add' | 'change' | 'remove' | 'undo';
  hash: string | null; // the version in force after the change; null after a removal
  previous: string | null; // the version in force just before
  changedBy: 'nixie' | 'owner';
  caller: { kind: 'owner' } | { kind: 'conversation' } | { kind: 'task'; taskID: string };
  undoes: string | null; // the change an undo reverses
  replaces: string | null; // the runtime change in force that this one superseded
  base: string | null; // the repo's version beneath the runtime layer at its first change
  definitions: string | null; // the repo's version at this change
};

// Erasable field `version`: the body of `hash`, for a version made at runtime.
type StoredTaskDefinition = {
  definitionID: string;
  hash: string;
  form: TaskDefinition; // parsed, defaults filled
  files: Record<string, string>; // the exact text of task.yaml, instructions.md, a step file
};

// The client renders a definition.changed record as a notice. The one example given, for an add:
//   "Scheduled: Water the tomatoes, every Friday at 08:00 (next: Fri 13 Mar). [Undo]"
// The text for a change, a remove and an undo is not written (open: notice text).

// definition.settled: no thread. A runtime change went out of force and no change replaced it.
type DefinitionSettled = {
  changeID: string;
  definitionID: string;
  outcome: 'adopted' | 'retired';
  cause: 'seed' | 'one_shot_fired' | 'one_shot_skipped';
  hash: string | null; // the version in force after it
};

// definition.repo_moved: no thread. A seed found another repo version beneath a change in force.
type DefinitionRepoMoved = { changeID: string; definitionID: string; definitions: string | null };

// definition.conflict_resolved: no thread. `nixie definitions resolve <id> --keep nixie|repo`.
type DefinitionConflictResolved = {
  changeID: string;
  definitionID: string;
  keep: 'nixie' | 'repo';
  definitions: string | null; // the repo's version at the choice: the base from then on for "nixie"
};

// definition.export_moved: no thread. One per move of an export.
type DefinitionExportMoved = {
  exportID: string;
  branch: string;
  to: 'exporting' | 'opened' | 'closed';
  pullRequest: PullRequestRef | null;
};

// ---- K. The tables of the runtime layer ----

// 2 projections, in one appended migration. Each fold reads its record and the rows the record
// names, and no other table.
//
// runtime_task_definitions
//   key: change_id. Unique on short_id. Unique on definition_id where state is "in_force".
//   columns: definition_id, operation, definition_hash, previous_hash, base_hash,
//            definitions_hash, replaces, undoes, state,
//            state_cause ("later_change" | "seed" | "one_shot_fired" | "one_shot_skipped" |
//                         "kept_repo"),
//            settled_by, changed_by, caller, changed_sequence, updated_sequence
//   folded from: definition.changed, definition.settled, definition.repo_moved,
//                definition.conflict_resolved
//   The fold of definition.changed also stores `version` under its hash in
//   task_definition_versions, when that hash is missing.
//
// task_definition_exports
//   key: export_id
//   columns: branch, state ("opened" | "closed" | null), pull_request_number, pull_request_url,
//            attempt_started_sequence, updated_sequence
//   folded from: definition.export_moved

// The domain type of a runtime_task_definitions row. The seed plan, the decider and the export
// take it; only the projection and its readers name the row. Its members follow the columns.
type RuntimeDefinitionChange = {
  changeID: string;
  shortID: string;
  definitionID: string;
  operation: DefinitionChanged['operation'];
  hash: string | null;
  previous: string | null;
  base: string | null;
  definitions: string | null;
  replaces: string | null;
  undoes: string | null;
  state: RuntimeChangeState; // "in_force" | "superseded" | "adopted" | "retired"
  stateCause: 'later_change' | 'seed' | 'one_shot_fired' | 'one_shot_skipped' | 'kept_repo' | null;
  changedSequence: number;
};

// ---- L. The functions of the definitions module, and the refusals ----

// What the tools call. `holders` lists the caller kinds that may hold the tools.
declare function requestDefinitionChange(
  context: DefinitionsContext,
  caller: DefinitionChanged['caller'],
  request: DefinitionRequest,
): DefinitionChangeResult;

type DefinitionRequest =
  | { kind: 'define'; version: StoredTaskDefinition }
  | { kind: 'undefine'; definitionID: string };

// Your action. Only the `definitions.undo` procedure of the API module calls it. It reads the
// state, calls pickDefinitionMove with an undo intent, and writes the move.
declare function undoDefinitionChange(
  context: DefinitionsContext,
  input: { changeID: string }, // a change ID or a short ID
): DefinitionChangeResult;

// Pure: the one place that decides a define, a removal and an undo. The undo table is in
// 03-flow.ts, section J. ONE_SHOT_PAST compares a time, and neither argument carries one
// (open: decider clock).
declare function pickDefinitionMove(
  state: DefinitionState,
  intent: DefinitionIntent,
): DefinitionMove | DefinitionRefusal;

type DefinitionState = {
  definitionID: string;
  definitions: string | null; // what the repo holds at the read
  layer: RuntimeDefinitionChange | null; // the runtime change in force
  head: RuntimeDefinitionChange | null; // the change with the greatest changed_sequence
  inForce: string | null;
  seedSequence: number;
};

// Refusals carry a code. No sentence is written for any of them (open: refusal text).
type DefinitionRefusal =
  | { code: 'REPLACED'; later: { changeID: string; shortID: string; operation: string } }
  | { code: 'REPO_MOVED'; seedSequence: number }
  | { code: 'NOT_IN_FORCE'; cause: 'one_shot_fired' | 'one_shot_skipped' | 'kept_repo' }
  | { code: 'ONE_SHOT_OVER_REPO' }
  | { code: 'ONE_SHOT_PAST' }
  | { code: 'ID_TAKEN' }
  | { code: 'NOT_FOUND' }
  | { code: 'UNCHANGED' }
  | { code: 'FILE_ONLY_KEYS' }
  | { code: 'INVALID'; reasons: string[] } // the schema's and the start bounds' sentences
  | { code: 'NOT_A_HOLDER' };

// Named and never defined (open: undefined types):
type DefinitionChangeResult = unknown;

type DefinitionMove = unknown;

type DefinitionIntent = unknown; // the `intent` parameter of pickDefinitionMove

type TaskSeedPlan = unknown;

declare function resolveDefinitionConflict(
  context: DefinitionsContext,
  input: { definitionID: string; keep: 'nixie' | 'repo' },
): void;

// What the server app passes to the triggers module as retireOneShot.
declare function retireOneShotInTransaction(
  tx: Transaction,
  context: DefinitionsContext,
  definitionID: string,
  cause: 'one_shot_fired' | 'one_shot_skipped',
): void;

// The body of the in-force seed.
declare function seedInForceInTransaction(
  tx: Transaction,
  options: unknown,
): 'seeded' | 'unchanged';

// Pure.
declare function buildTaskSeedPlan(input: {
  definitions: string;
  runtime: RuntimeDefinitionChange[];
  seedSequence: number;
}): TaskSeedPlan;

declare function isExportedDefinition(version: StoredTaskDefinition | null): boolean; // false

//                                                                              for a one-shot

declare function buildTaskChangeKind(input: {
  log: Log;
  branchOf: (definitionID: string) => string; // returns "nixie/tasks" for every definition
}): DefinitionsChangeKind;

// ---- M. The API procedures ----

// Each is `signedIn`, in the contract lib.

// definitions.undo: a checked action. No tool reaches it.
type DefinitionsUndoInput = { changeID: string };

type DefinitionsUndoOutput = {
  definitionID: string;
  changeID: string;
  restored?: 'repo'; // (open: undo output)
};

// tasks.listFinished
type TasksListFinishedInput = { before?: number; limit: number; definitionID?: string };

//                              before: a sequence. limit: 1 to 100.
type TasksListFinishedOutput = {
  tasks: listedTask[]; // named and never defined (open: undefined types)
  runs: FinishedRun[]; // ended task runs, through readFinishedRuns of the tasks family. Each
  //                      one carries its sequence.
  next: number | null; // the sequence to pass as `before` for the page after this one
};

// triggers.report
type TriggersReportInput = { since: string; definitionID?: string }; // since: a date

type TriggersReportOutput = {
  entries: Array<{
    definitionID: string;
    name: string;
    kind: 'late' | 'skipped'; // late: a trigger.fired with isCatchUp true.
    //                           skipped: a trigger.skipped record.
    scheduledFor: string;
    firedAt: string | null;
    lateBySeconds: number | null;
    reason: TriggerSkipped['reason'] | null;
    sequence: number;
  }>;
};

// definitions.listTasks. No input.
type DefinitionsListTasksOutput = {
  definitions: Array<{
    definitionID: string;
    name: string;
    enabled: boolean;
    target: 'task' | 'conversation';
    trigger: Trigger | null;
    rendered: string;
    next: string | null; // null for a spent one-shot held in the repo
    tools: string[];
    origin: 'definitions' | 'nixie';
    createdBy: { sequence: number; kind: string } | null; // the definition.changed record of a
    //   runtime definition, or the seed record of one from the repo
    taskID: string | null;
  }>;
};
