// Tasks: every agreed shape. Not compiled. No package imports this file.
// The sketches hold the shapes and the exact texts. The docs hold the rules.
//
// Not agreed, and so not binding: (open: undefined task types)
// - These types are used and defined nowhere in the agreed design: EnvelopeView, RunSettings,
//   TaskPolicy, RunSpan, SessionWindow, WorkerCall, WorkerCaller, WorkerPlan, WorkerRefusal,
//   WorkerResult. TaskRun and RunEnd are defined in section G as this sketch's reading.
// - The parameter lists of these functions are this sketch's reading. Only their names and what
//   they decide are agreed: pickRecordRun, readRunRecords, countRunCalls, writeRunEndInTransaction,
//   pickTaskAfterReport, pickTurnInbox, pickPinnedBrief, listReportRecords, planWorkerRun,
//   runWorker, parseTaskStartInput.
// - The helper names inside 03-flow.ts are this sketch's own.
// Names that the code has, with their built signatures, are marked "built".

// ---- A. The task run records ----

// The tasks module owns 3 record kinds. All sit on the task's own thread. None is an inbox kind.

// task.run_opened: written in the claim's transaction, before task.step_started.
interface TaskRunOpened {
  taskID: string;
  runID: string; // crypto.randomUUID()
  openedByStep: string; // the step key of the first step
  origin: {
    // start | trigger | message | owner | timer | raise | restart   (open: origin kinds)
    kind: string;
    sequence: number | null; // the record that gave the work
  };
  definitionID: string | null; // null for a started task
  definitionHash: string | null; // the version this task run pins; null for a started task
  triggerKey: string | null; // the dedupe key of the trigger.fired record; a carried task run copies it
  carriesRunID: string | null; // set when origin.kind is raise or restart
  briefID: string | null; // a short ID: the brief of a definition's task run; null for a started task
  report: { mode: 'wake' | 'next_turn' | 'none'; target: string | null }; // resolved and pinned here
  reportShape: ReportShape | null; // pinned here; null for a task that declares none
  limits: Record<string, number>; // { turns: 40, dollars: 10, 'calls:moment.edit': 3 }
}

// task.run_report_requested: what task.report writes. Erasable: { summary, fields? }
interface TaskRunReportRequested {
  taskID: string;
  runID: string;
  stepKey: string;
  reportID: string; // a short ID, and the report message's ID
}

// task.run_ended: written last in the ending transaction. Erasable: { body }, the YAML report.
interface TaskRunEnded {
  taskID: string;
  runID: string;
  cause: string; // reported | limit | stopped | closed | failed | no_work | no_report
  detail: Record<string, string | number>; // { meter, used, limit } | { errors } | {}
  endedBy: string; // step:<stepKey> | control:stop | control:close | claim:<stepKey>
  definitionID: string | null; // copied from task.run_opened, so a fold reads an end from this record alone
  triggerKey: string | null; // copied likewise
  carriesRunID: string | null; // copied likewise
  used: Record<string, number>; // each meter's count at the end
  reportID: string; // a code-made report has no request to take it from: (open: code-made report ID)
  reportTo: string | null;
  delivery: 'wake' | 'next_turn' | 'kept'; // kept: the report stays on this record only
}

// The codec stores `cause` and `origin.kind` as strings. Code reads both through a closed union
// with an `unknown` member, so a `match` stays exhaustive.
type RunEndCause =
  | 'reported'
  | 'limit'
  | 'stopped'
  | 'closed'
  | 'failed'
  | 'no_work'
  | 'no_report'
  | 'unknown';

// One optional payload key on the 3 kinds a step writes with no lease check:
//   tool_called, tool_result, task.failed_turn_spent: { ...existing, taskRunID?: string }
// ToolRun.runID keeps its value and its meaning. The step run ID of the turn-input log's records
// does not change.

// The projection: section G.

// ---- B. Readers, and what a runner and a tool call get ----

declare function pickRecordRun(record: LogRecord, runs: readonly TaskRun[]): TaskRun | null;

declare function readRunRecords(
  span: RunSpan,
  kinds: readonly string[],
): Promise<readonly LogRecord[]>;

type RunState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'open'; run: TaskRun; phase: 'active' | 'waiting_reply' | 'idle' };

declare function readRunState(db: Database, taskID: string): Promise<RunState>;
declare function readPreviousRun(db: Database, run: TaskRun): Promise<TaskRun | null>; // the newest opened before `run`

declare function readRunUsage(
  context: Context,
  run: TaskRun,
  meters?: readonly string[],
): Promise<Record<string, number>>;

declare function readFinishedRuns(
  db: Database,
  query: { definitionID?: string; taskID?: string; beforeSequence?: number; limit: number },
): Promise<readonly FinishedRun[]>;

// An ended task run. In prose, "finished" means only the listed state of section K.
interface FinishedRun {
  sequence: number; // of its task.run_ended record: what a caller pages by
  runID: string;
  taskID: string;
  definitionID: string | null;
  definitionHash: string | null;
  triggerKey: string | null;
  carriesRunID: string | null;
  startedAt: Date;
  endedAt: Date;
  cause: RunEndCause;
  detail: Record<string, string | number>;
  reportID: string;
}

// StepInput.run: the open task run, or null for the conversation and a system task with no
// definition.
// StepResult.run:
type StepRunResult = {
  activity: 'worked' | 'none';
  limit?: { meter: string; used: number; limit: number };
};

// ToolRun.taskRun, set per step beside stepRunID:
type ToolTaskRun = { runID: string; fromSequence: number; maxCalls: Record<string, number> };

// The tools module counts by taskRunID. It imports nothing from the tasks module, so the caller
// passes `since` and the task run in.
declare function countRunCalls(
  context: Context,
  taskRun: ToolTaskRun,
  tool: string,
): Promise<number>;

// A meter counts one key of the pinned `limits`.
type RunMeter = {
  name: string; // turns | dollars | calls:
  read(context: Context, span: RunSpan, key: string): Promise<number>;
  render(limit: number, key: string): string; // "$10", "40 turns"
};

// The sessions module registers `turns` and `dollars`. The tools module registers `calls:`.

// The writer of an end, and the 2 pickers. The tasks module does not export the writer.
declare function writeRunEndInTransaction(tx: Transaction, end: RunEnd): Promise<void>;
// Its answer is the `nextState` of task.step_committed: what the step asked.
declare function pickTaskAfterReport(policy: TaskPolicy, settings: RunSettings): TaskState;

declare function pickReportMode(
  given: 'wake' | 'next_turn' | 'none' | undefined,
  from: 'start' | 'definition',
  settings: RunSettings, // the server passes both defaults here; no config key holds them
): 'wake' | 'next_turn' | 'none'; // default: wake for a start, next_turn for a definition

// ---- C. The summary that code writes ----

// A task run that ends with no task.report call gets one of these as its summary.
const codeMadeSummaries = {
  // {limit}: "$10" or "40 turns", from the meter's `render`. (open: limit summary)
  limit: 'The run stopped at its {limit} limit before it wrote a summary.',
  stopped: 'The run was stopped before it wrote a summary.',
  closed: 'The task was closed before it wrote a summary.',
  failed: 'The run failed after {count} errors before it wrote a summary.',
  no_work: 'The run had nothing to do, so it ran no model turn.',
  no_report: 'The run ended before it wrote a summary.',
};

// ---- D. task.report and the report shape ----

// effects: ['note'], execution: 'direct', recordInput: () => ({})
// input: { summary: string, fields?: object }, additionalProperties: false
// summary: 1 to 8000 characters after trim. reportID: a short ID.
declare function taskReport(input: { summary: string; fields?: JSONObject }): { reportID: string };

type ReportShape = { properties: Record<string, FieldSchema>; required?: string[] };

// The closed table. A keyword outside it is refused at the seed and the start.
type FieldSchema = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string; // at most 200 characters
  enum?: (string | number)[]; // 1 to 50 values
  items?: FieldSchema; // with type: array
  properties?: Record<string, FieldSchema>; // with type: object
  required?: string[]; // with type: object; each name is one of its properties
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};

// A field name matches ^[A-Za-z][A-Za-z0-9_]{0,39}$. The shape is at most 4,000 characters as JSON.

// the tools module: the parser the registry builds for each tool, moved out as one export
declare function buildSchemaParser(schema: JsonSchema): (value: unknown) => SchemaCheck;

// the tasks module, each pure
type ShapeFault =
  | { fault: 'keyword'; path: string; keyword: string }
  | { fault: 'value'; path: string; keyword: string }
  | { fault: 'required'; path: string; name: string }
  | { fault: 'size'; size: number; max: number };

declare function checkReportShape(
  shape: unknown,
): { status: 'accepted'; shape: ReportShape } | { status: 'refused'; fault: ShapeFault };

declare function buildShapeSchema(shape: ReportShape): JsonSchema; // adds type: object and additionalProperties: false

declare function checkReportFields(
  shape: ReportShape | null,
  fields: JSONObject | undefined,
): { status: 'accepted'; fields: JSONObject | null } | { status: 'refused'; message: string };

declare function renderReportBody(report: {
  summary: string;
  fields: JSONObject | null;
  missing: readonly string[];
}): string;

// TaskStartChoiceRefusal takes the reason `report_shape`, with a fault. The seed puts the file's
// name before each sentence.
const shapeFaultSentences = {
  // a keyword outside the table, such as `pattern`, `$ref` or `oneOf`
  keyword:
    'the report shape uses {keyword} at {path}, which nixie cannot enforce, so nixie started nothing. A report shape takes only {the keywords of the table}.',
  // a keyword of the table with a value it cannot take, or a bad name
  value:
    'the report shape has a {keyword} at {path} that nixie cannot read, so nixie started nothing',
  // a `required` name that the properties beside it lack
  required:
    'the report shape requires {name} at {path}, which its properties lack, so no report could match, and nixie started nothing',
  // the shape is longer than 4,000 characters as JSON
  size: 'the report shape is {n} characters and the most is 4000, so nixie started nothing',
};

// The refusals of a task.report call. Each is the outcome `error`. An empty summary is the outcome
// `invalid`, from the input schema.
const reportCallRefusals = {
  // the fields do not match the shape
  mismatch:
    "This report's fields do not match the shape this task declares, so nixie sent nothing and the run goes on. {faults} Call task.report again with a summary and with fields that match this schema: {schema}",
  // the task declares no shape, and the call has fields
  noShape:
    'This task declares no report fields, so nixie sent nothing and the run goes on. Call task.report again with a summary only.',
  // the fields are longer than 16,000 characters as JSON
  size: "This report's fields are {n} characters and the most is 16000, so nixie sent nothing and the run goes on. Call task.report again with shorter fields.",
  // the task run already holds a report request
  second: 'This run already sent its report as {reportID}.',
  // the step's lease is gone: the sentence that task.message gives for its refusal `stale_step`
  // (built, in the task message tool). (open: stale step check)
};

// {faults}: each required field that is missing, a count of the fields the shape lacks, then the
// validator's path and rule for each other fault. Never a value or a key the model sent.
// {schema}: the pinned shape as one line of JSON, the text of the report-shape block.

// ---- E. The report body and the blocks of a task run ----

// The body is the same text in task.run_ended and in the delivered task_message.
//   no shape:                         report: { summary }
//   a shape, and an accepted report:  report: { summary, fields: { ...the model's values } }
//   a shape, and an end with no report:
//                                     report: { summary: <the sentence code writes>, missing: [each top-level declared name] }

// The sessions module renders at most 2 blocks for a task run and stores neither.
declare function renderRunBlocks(run: TaskRun): string;
// The `trigger` block: an <input> block named `trigger`. Its values: schedules-and-triggers.md.
// The report-shape block:
//
//   <report-shape fence="k3f9">
//   End this run with task.report. Beside summary, pass fields that match this schema:
//   {"type":"object","properties":{...},"required":["pagesRead","confidence"],"additionalProperties":false}
//   </report-shape fence="k3f9">
//
// The block that holds the start of the previous task run: (open: previous start block)

// log.read: an entry of the role `task` for every task_message on the thread it reads.
//   text: "{kind} {messageID} from task {taskID}" and then the body; null once forgotten;
//   cut at 2,000 characters as every entry is.

// The forget of a report: the sequences of its 3 records, from any one of them.
declare function listReportRecords(tx: Transaction, record: LogRecord): Promise<readonly number[]>;

// ---- F. Call caps ----

// A definition's `maxCalls: Record<toolName, number>` becomes the keys `calls:<tool>` of the
// pinned `limits`. The key itself: task-definitions.md.
const callCapRefusal = 'This run has used its {n} calls to {tool}.'; // a tool_result, outcome `denied`, no decision

// A call counts when its outcome is result, queued or unknown, or while it is in flight.
// An invalid, denied, error or failed call never counts.

// ---- G. The task_runs projection ----

// One appended migration adds the table `task_runs`. The fold reads only the 3 kinds of section A.
// A unique partial index on the task ID, where the end is null, allows one open task run per task.
// The column `report_shape` is JSON text or null.

// One row of `task_runs`. This sketch's reading: (open: undefined task types)
interface TaskRun {
  runID: string;
  taskID: string;
  openedSequence: number;
  startedAt: Date;
  opened: TaskRunOpened; // the pinned report mode, target, report shape and limits
  reportID: string | null; // set by task.run_report_requested
  ended: TaskRunEnded | null;
}

// What a caller hands the writer of an end. This sketch's reading: (open: undefined task types)
interface RunEnd {
  run: TaskRun | null; // null: write nothing
  cause: RunEndCause;
  detail: Record<string, string | number>;
  endedBy: string; // step:<stepKey> | control:stop | control:close | claim:<stepKey>
}

// ---- H. The message envelope ----

interface TaskEnvelope {
  id: string;
  from: string;
  kind: TaskMessageKind;
  replyTo: string | null;
  sent: string;
  onBehalfOf: readonly string[];
  body: string | null;
}

interface EnvelopeOptions {
  // slots: {agent}, {owner}, {name}
  labels: { conversation: string; personaTask: string; plainTask: string; definition: string };
  taskIDSuffix: string | null; // null: no ID in the label. Else appended inside it, with {id}
  hasOnBehalfOf: boolean; // when true, rendered after `sent`
}

// The one constant the server passes in. How the suffix joins each label is one reading of the
// rule, and the label of the conversation holds no ID. (open: label task ID)
const envelopeOptions: EnvelopeOptions = {
  labels: {
    conversation: '{agent}, in the chat with {owner}',
    personaTask: '{agent} (task: {name})', // with the suffix: "{agent} (task: {name}, {id})"
    plainTask: 'task: {name}',
    definition: 'task definition: {name}', // picked by the brief's origin `definition`, not by a speaker
  },
  taskIDSuffix: ', {id}',
  hasOnBehalfOf: true,
};

// {agent}: agent.names[0] from the config, or "nixie". {owner}: owner.name, or "the owner".
// {id}: the sender's short task ID. A label holds no pronoun.

// any task_message, a brief included
declare function toTaskEnvelope(record: LogRecord, view: EnvelopeView): TaskEnvelope;
// for the brief origins 'created' and 'definition'
declare function toBriefEnvelope(brief: TaskBrief, view: EnvelopeView): TaskEnvelope;
// the attributes in order, and the closing tag
declare function renderTaskEnvelope(envelope: TaskEnvelope): string;

// Attribute order: id, from, kind, reply-to (only on a reply), sent, fence.
// on-behalf-of renders after `sent`, only on a message that passes on your messages.
// (open: on-behalf-of position)
// The value of `fence` is the random block ID. The closing tag repeats it.
// A forgotten body renders as: "[a message since forgotten]" (built).

// TaskProfile takes:
type TaskSpeaker = 'conversation' | 'persona_task' | 'plain_task'; // read from the start's `persona` option

// <owner-message id from sent>: id is the event ID that `onBehalfOf` takes.
// <system-message type id at>: type is one value of SystemMessageType; id is random and only
// closes the element. The type `task-start` is removed.

// ---- I. The brief ----

// The brief record. kind: task_message. Erasable: { body: <the brief> }
interface BriefRecord {
  messageID: string; // createShortID(): the ID the model sees and passes as replyTo
  from: string; // the starter's task ID
  to: string; // the new task's ID
  kind: 'request';
  replyTo: null;
  onBehalfOf: [];
  hop: 0;
  hopLimit: number;
  wake: true;
  woke: true; // so the task counts it as unread waking input
  opensWait: false; // the starter never waits on a brief
  source: `task:${string}`; // task:<from>
}

// Built: writeTaskStart(context, request: TaskStartRequest): Promise<TaskStartOutcome>. It owns its
// write transaction. The design adds the hop limit to what it takes; the result is the same type.
// 2 records gain one optional payload key each:
//   'task.created':         { ...existing, briefMessageID?: string } // erasable: { name }; `brief` is not written
//   'model.session_opened': { ...existing, briefSequence?: number | null } // the brief this opening accounted for

// The caller holds the write transaction and owns the rerun rule. Only a start calls it.
declare function writeBriefMessageInTransaction(
  tx: Transaction,
  context: Context,
  messaging: Pick<TaskMessaging, 'hopLimit'>,
  write: { messageID: string; from: string; to: string; body: string },
): Promise<LogRecord>;

interface TaskBrief {
  // created: a task that an older release started; definition: a definition's task run
  origin: 'message' | 'created' | 'definition';
  // for created: the task's own ID, which is a short ID; for definition: the task run's briefID
  messageID: string;
  from: string | null; // null for definition: the sender's label is the definition's
  sequence: number;
  sentAt: Date;
  body: string | null; // null once forgotten
}

// The newest brief of the task before a sequence. For a definition's task: the brief of the
// newest task run opened before it. Null for a fixed task.
declare function readTaskBrief(
  context: Context,
  taskID: string,
  before?: number,
): Promise<TaskBrief | null>;

// A started task's brief is found by sequence. It is written before the claim that opens the first
// task run, so it belongs to no task run.
declare function readTaskBriefs(
  context: Context,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, TaskBrief>>;

declare function pickTurnInbox(
  inbox: readonly LogRecord[],
  briefSequence: number | null,
): readonly LogRecord[];

declare function pickPinnedBrief(brief: TaskBrief, window: SessionWindow): TaskBrief | null;

// ---- J. The frame of the task prompt ----

// The second paragraph is fixed text. Change no word of it. (open: starter label)
// The text uses no `agent.name` path: (open: frame agent name)
const taskFrame = `You are "{{ task.name }}", one of the tasks that nixie runs for {{ owner.name }}.

You're running on your own, and nobody reads what you write here. Treat it as your own notes. To send anything to someone, use task.message. A turn where you send nothing is fine: just stop.

When the work your brief asks for is done, call task.report with a short summary. That ends your work and sends the result to {starter label}.`;

// ---- K. Wakeable tasks and the task list ----

// TaskProfile.isWokenByMessages is renamed TaskProfile.wakeable.
// Each listed task takes `wakeable: boolean`, and an asleep task with a schedule shows
// `nextRunAt`, an ISO time. The API contract's task list takes both as optional fields.
type ListedTaskState = TaskState | 'idle' | 'finished' | 'asleep';

const asleepNote =
  '{name} is asleep and reads this at its next run. A reply, if any, arrives as a new message.';

// ---- L. The log grant ----

// one more member of the start input, beside `memory` and `persona`
type TaskLog = 'own' | 'conversation'; // default 'own'; a stored record with no `log` key reads as 'own'

const logGrantRefusal =
  "You can give a task the conversation's log only when you hold it yourself, and you do not.";

// The `starter` of planTaskStart: { tools, memory, persona, log }.
// ToolRun takes `logThread: string`, set per step from the task's setup and never stored.
// ToolRun.thread keeps its value. TaskSetup.log holds the stored value: section P.

// ---- M. worker.run ----

// effects: ['note'], execution: 'direct', content: ['question']
// results: { workerRunID: 'owner_data', answer: 'untrusted', used: 'owner_data' }
// question: 1 to 8000 characters. tools: at most 50 distinct names. No other key.
declare function workerRun(input: { question: string; tools: string[] }): {
  workerRunID: string; // a short ID
  answer: string;
  used: WorkerUsed;
};

interface WorkerUsed {
  minutes: number; // 1 decimal place
  turns: number; // model calls
  tokens: number; // input, output, cache read and cache write
  dollars: number; // priced on the worker's profile
}

// planWorkerRun makes every check. runWorker takes the plan and never a raw tool list.
declare function planWorkerRun(call: WorkerCall, caller: WorkerCaller): WorkerPlan | WorkerRefusal;
declare function runWorker(plan: WorkerPlan, hold: ToolStepHold): Promise<WorkerResult>;

const workerRefusals = {
  // the call came under no model turn's step token
  no_step: 'Only a model turn can run a worker.',
  // the worker has not started, or has stopped
  unavailable: 'The worker is not running, so nixie started none.',
  // a name the caller does not hold
  wider_tools:
    'A worker gets only tools you hold, and you do not hold {tools}, so nixie started none.',
  // task.start, task.message, tasks.list, task.report, turn.end_silently, worker.run, or a
  // conversation-only tool
  worker_tools: 'A worker can never use {tools}, so nixie started none.',
  // a memory tool
  memory_tools: 'A worker cannot get {tools}, so nixie started none.',
  // the calling task has reached its dollar limit
  no_dollars_left: 'This task has reached its dollar limit, so nixie started no worker.',
};

// The config keys: 01-usage.ts, section I. `whenFull` is 'wait' or 'error'.
// origin.kind values that this family writes: start | trigger | message | raise | restart.

// in the types of the tools module; ToolSession takes `step?: ToolStepHold`
interface ToolStepHold {
  readonly signal: AbortSignal; // the step lost its lease or was ended: the call returns nothing
  readonly interrupt: AbortSignal; // the turn was interrupted or reached its dollars: the call stops and answers
  readonly readLeftDollars: () => number | null; // null for a caller with no dollar limit
  readonly onSpend: (dollars: number) => void; // adds to the calling turn's budget as it is spent
}

// ToolContext takes `callSequence`, the sequence of this call's `tool_called`.
// GuestToolRun takes `parent?`, which each `tool_called` of the tool run takes as its parent.
// Built: createCallBudget(prices, leftDollars) returns { onCall, signal, getSpentDollars }.
// The design adds `onSpend` and `getLeftDollars` to what it returns.

// ---- N. The worker records ----

// All 3 sit on the calling task's thread, with the calling `tool_called` as their parent.

// worker.run_started: written before the sandbox is created. No erasable field: the question is
// in the erasable input of the calling `tool_called`.
interface WorkerRunStarted {
  workerRunID: string; // crypto.randomUUID()
  shortID: string;
  callID: string;
  stepRunID: string;
  taskRunID?: string;
  model: string;
  profile: string;
  tools: string[];
  limits: { minutes: number; turns: number; tokens: number; dollars: number };
  isTaskLimit: boolean; // the dollars are what the task had left
}

// worker.turn_ended: one per model call, written as the call ends. Erasable: { text }, source `untrusted`
interface WorkerTurnEnded {
  workerRunID: string;
  callID: string;
  taskRunID?: string;
  model: string;
  profile: string;
  turn: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  dollars: number;
}

// worker.run_ended: written after the turn records. Erasable: { detail } on a failure, source `untrusted`
interface WorkerRunEnded {
  workerRunID: string;
  callID: string;
  taskRunID?: string;
  model: string;
  profile: string;
  outcome: string; // answered | limit | sandbox_failed | model_failed | interrupted | no_answer | aborted
  limit?: string; // minutes | turns | tokens | dollars
  used: WorkerUsed;
}

// The codec stores `outcome` and `limit` as strings. Code reads them through a closed union with
// an `unknown` member.

// ---- O. What the caller of a worker gets at each end ----

// {id}: the worker run's short ID. {used}: "It used {minutes} minutes, {turns} turns, {tokens}
// tokens and ${dollars}."
const workerEndSentences = {
  // a limit: minutes, turns, tokens or dollars. End record: limit. Sandbox: destroyed.
  limit:
    'The worker {id} stopped at its {limit} limit of {max} and gave no answer. It used {minutes} minutes, {turns} turns, {tokens} tokens and ${dollars}. Ask a narrower question, or do the work yourself.',
  // the dollars reached are the task's own: the same sentence, with this clause in place of
  // "stopped at its {limit} limit of {max}". End record: limit. Sandbox: destroyed.
  taskDollars: '…stopped because this task has ${max} left of its dollar limit…',
  // the cap is reached, whenFull: error. End record: none. Sandbox: none made.
  capFull:
    '{max} workers already run, which is the most at once, so nixie started none. Call again when one of yours has returned.',
  // the sandbox fails to start. End record: sandbox_failed. Sandbox: swept.
  sandbox_failed:
    'The worker {id} could not start its sandbox. {used} A second call starts a new worker.',
  // a model API refusal or error. End record: model_failed. Sandbox: destroyed.
  model_failed: "The worker {id}'s model call failed: {detail}. {used}",
  // the session ends with no text. End record: no_answer. Sandbox: destroyed.
  no_answer: 'The worker {id} ended with no answer. {used}',
  // the calling turn is interrupted. End record: interrupted. Sandbox: destroyed.
  interrupted: 'The worker {id} stopped because this turn was interrupted. {used}',
};

// The cap is reached, whenFull: wait: the call waits, then gets the worker run's result or the
// minutes error. No sandbox exists until a slot is free.
// The calling step loses its lease or is ended: the call rejects. End record: aborted. Sandbox:
// destroyed.
// The process dies: no end record. A rerun of the step starts a new worker. Recovery destroys
// the sandbox.

// ---- P. The task runner port ----

export interface TaskRunnerDefinition<Options = unknown> {
  readonly key: string; // the `runner` value of a start and of a stored task
  readonly controls: readonly TaskControl[]; // the controls nixie accepts for its tasks
  readonly start: RunnerStart<Options> | null; // null: no start can pick it
  readonly fixedTasks: readonly string[]; // the tasks it runs that no start made
  readonly keepsSandboxes: boolean; // recovery keeps the sandboxes its open tasks own
}

export interface RunnerStart<Options> {
  readonly schema: z.ZodType<TaskStartEnvelope>; // one strict variant of the start union
  readonly describeInput: (bounds: TaskStartBounds) => JsonSchema; // the variant as the model sees it
  readonly declaration: EffectDeclaration; // of `task.start/<key>`
  readonly plan: (
    start: TaskStartEnvelope,
    starter: TaskStarter,
    bounds: TaskStartBounds,
  ) => RunnerStartPlan<Options>;
  readonly parseOptions: (stored: JSONObject) => Options; // reads what `plan` stored
}

// what the envelope reads from every start, whatever the runner
export interface TaskStartEnvelope {
  runner?: string;
  name: string;
  brief: string;
  report?: TaskReport;
  limits?: Partial<TaskLimits>;
}

export type RunnerStartPlan<Options> =
  | { status: 'planned'; envelope: { report: TaskReport; limits: TaskLimits }; options: Options }
  | { status: 'refused'; sentence: string };

export interface BoundRunner {
  readonly definition: TaskRunnerDefinition;
  readonly runStep: RunStep;
}

export interface TaskRunnerRegistry {
  readonly startable: readonly TaskRunnerDefinition[];
  // null for a task no runner runs. The order: 03-flow.ts, section J.
  readonly resolve: (
    context: Pick<TasksContext, 'log'>,
    taskID: string,
  ) => Promise<TaskRunnerDefinition | null>;
  readonly readKeptSandboxOwners: (
    context: Pick<TasksContext, 'log'>,
  ) => Promise<readonly string[]>;
  readonly bindSteps: (
    context: Pick<TasksContext, 'log'>,
    bound: readonly BoundRunner[],
    fallback: RunStep,
  ) => RunStep;
}

export declare function buildTaskRunnerRegistry(options: {
  definitions: readonly TaskRunnerDefinition[];
  defaultRunner: TaskRunnerDefinition; // runs a started task whose record holds no `runner`
}): TaskRunnerRegistry;

// Room for the outside-session runner, which is not built: one definition with its own variant and
// controls, and one bound step. Its step key keys a session start, and a message delivery is a
// keyed action under the step, through the action queue. Its stored options are its own. An
// optional `release(taskID, cause)` beside `runStep`, called after nixie writes the control, lands
// with that runner, as do a call for terminal input and a message kind for a typed line.

// The `task.created` payload takes 3 optional keys:
//   runner?: string            // a nixie start writes 'nixie', and `options` unchanged
//   envelope?: { report, limits }   // only for a runner other than the default
//   runnerOptions?: JSONObject      // what that runner's `plan` returned as `options`; likewise

// The one definition of what a task was set up with. Built: TaskSetup is an interface
// { startedBy, options, limits }, and readTaskSetup returns TaskSetup | null. Slice 8 replaces it.
type TaskSetup =
  // from `options` of a nixie start, or from `envelope` of another runner's start
  | {
      kind: 'started';
      runner: string;
      startedBy: string;
      report: TaskReport;
      limits: TaskLimits;
      log: 'own' | 'conversation';
    }
  | { kind: 'definition'; definitionID: string; definitionHash: string | null } // the hash in force
  | { kind: 'fixed' }; // the conversation and each fixed task

declare function readTaskSetup(context: Context, taskID: string): Promise<TaskSetup>;

// task.start: the tool definition takes variants. The decision point is asked about
// `task.start/<key>` with that variant's declaration.
interface ToolDefinitionVariants {
  variants?: { pick: (input: unknown) => string; declarations: Record<string, EffectDeclaration> };
}

declare function parseTaskStartInput(
  input: unknown,
  registry: TaskRunnerRegistry,
): TaskStartEnvelope;

// planTaskControl takes the definition's `controls`. The reply reason for any other control:
//   runner_lacks_control   (never stored in a record)
// The API contract: a listed task takes `runner`; the task list takes a `runner` filter; the
// control reply takes the refusal `runner_lacks_control`.
