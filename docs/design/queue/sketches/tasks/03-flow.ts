// Tasks: each flow as commented code. Not compiled. No package imports this file.
// Shapes: 02-types.ts. The sketches hold the shapes and the exact texts. The docs hold the rules.

// ---- A. A claim opens a task run, or joins the open one ----

async function claimStep(tx, task, step) {
  const state = await readRunState(tx, task.id); // none | pending | open

  if (state.kind === 'open') {
    const fire = readUnreadFire(tx, task); // a trigger.fired record

    if (state.phase === 'idle' && fire && fire.dedupeKey !== state.run.triggerKey) {
      // One transaction: end the idle task run, open the next.
      await writeRunEndInTransaction(tx, {
        run: state.run,
        cause: 'no_report',
        endedBy: `claim:${step.key}`,
      });

      return openRun(tx, task, step, { kind: 'trigger', sequence: fire.sequence });
    }

    return state.run; // join. A rerun and a waking message both join.
  }

  // No task run is open.
  const control = readNewerControl(tx, task); // a raise or a restart, newer than the last end

  if (control && ['limit', 'stopped', 'failed'].includes(lastEnd(task).cause)) {
    const carried = lastRun(task);

    return openRun(tx, task, step, {
      kind: control.kind, // raise | restart
      sequence: control.sequence,
      carriesRunID: carried.runID,
      triggerKey: carried.triggerKey, // copied
      briefID: carried.briefID, // copied
      reportShape: carried.reportShape, // copied
      definitionHash: carried.definitionHash, // a definition's task runs under the same version
      limits: raisedLimitsLessUsed(control, carried), // (open: raise limits pin)
    });
  }

  if (task.holdsLimit) return pauseTask(tx, task); // a held limit and no open task run: open nothing

  // A started task: unread waking input opens a task run.
  // A definition's task: only the cases that pickRunDefinition lists (task-definitions.md).
  return openRun(tx, task, step, pickOrigin(tx, task));
}

async function openRun(tx, task, step, origin) {
  // Written in the claim's transaction, before task.step_started.
  await writeRecord(tx, 'task.run_opened', {
    taskID: task.id,
    runID: crypto.randomUUID(),
    openedByStep: step.key,
    origin: { kind: origin.kind, sequence: origin.sequence },
    report: {
      mode: pickReportMode(task.report, task.definitionID ? 'definition' : 'start', settings),
      target: task.definitionID ? CONVERSATION : task.startedBy,
    },
    reportShape: origin.reportShape ?? readShape(task), // the start's options or readDefinitionRunPolicy
    limits: origin.limits ?? readLimits(task), // turns, dollars and each calls:<tool>
    // definitionID, definitionHash, triggerKey, carriesRunID, briefID: 02-types.ts, section A
  });
}

// ---- B. A step's commit ends the task run, or leaves it open ----

// The first row that holds wins.
function pickRunEnd(commit): { cause: RunEndCause | null; nextState: TaskState } {
  if (commit.run.hasReportRequest) return { cause: 'reported', nextState: commit.asked };

  if (commit.result.run.limit) return { cause: 'limit', nextState: 'ready' }; // paused under the limit hold

  if (commit.result.done) return { cause: 'no_report', nextState: 'done' };

  if (commit.hasQueuedWork) return { cause: null, nextState: commit.asked };

  if (commit.hasOpenReplyWait) return { cause: null, nextState: 'waiting' };

  if (commit.isFirstStep && commit.result.run.activity === 'none')
    return { cause: 'no_work', nextState: 'waiting' };

  if (commit.task.wakeable) return { cause: null, nextState: 'waiting' }; // a quiet turn: the task run is idle

  return { cause: 'no_report', nextState: 'waiting' }; // a quiet turn on a task that is not wakeable
}

// A stop and a close end the task run in the control's transaction: `stopped`, `closed`.
// The step error that fails the task ends it in that error's transaction: `failed`.
// A step commits at once, for every runner, when its task run already holds a report request.
// A stale step's lease check fails, so its commit ends nothing.
// A throw in the ending transaction leaves the task run open, and the caller's retry ends it.
// Recovery writes no run-end record: the rerun of the step joins the open task run.

// ---- C. A task.report call ----

// The first step that refuses ends the call.
async function runTaskReport(call, toolRun) {
  // 1. Reads only the call and the pinned shape. Fields left out count as an empty object.
  const run = await readOpenRun(toolRun.taskRun.runID);

  const check = checkReportFields(run.reportShape, call.fields);

  if (check.status === 'refused') return error(check.message); // writes nothing, ends nothing, counts toward no cap

  // 2. One write transaction. Of 2 calls in one turn, only the first writes.
  return withWriteTransaction(async (tx) => {
    // The lease read of the task message writer (built: readLeasedStepHop). ToolRun.taskRun is set
    // per step, so it cannot show a lost lease. (open: stale step check)
    const hop = await readLeasedStepHop(tx, taskID, step, clock.now());

    if (hop === null) return error(STALE_STEP_SENTENCE);

    const sent = await readReportRequest(tx, run.runID);

    if (sent) return error(`This run already sent its report as ${sent.reportID}.`);

    const reportID = createShortID();

    await writeRecord(
      tx,
      'task.run_report_requested',
      { taskID, runID, stepKey, reportID },
      { summary, fields },
    );

    return { reportID };
  });
  // 3. The step's commit ends the task run with `reported`: section B, then section D.
}

// ---- D. The ending transaction writes the report ----

async function writeRunEndInTransaction(tx, end) {
  if (!end.run) return; // no task run is open: write nothing

  const request = await readReportRequest(tx, end.run.runID); // null once its key is forgotten

  const body = renderReportBody(
    request // a code-made report has no request, and so no reportID: (open: code-made report ID)
      ? { summary: request.summary, fields: request.fields ?? null, missing: [] }
      : {
          summary: codeMadeSummaries[end.cause],
          fields: null,
          missing: topLevelNames(end.run.reportShape),
        },
  );

  const delivery = pickDelivery(end); // below

  if (delivery !== 'kept') {
    // From the task to its report target, with reportID as its message ID and the same body.
    await writeTaskMessage(tx, {
      kind: 'report',
      messageID: reportID,
      wake: delivery === 'wake',
      body,
    });
  }

  if (end.cause === 'limit') {
    // The nixie runner calls writeTaskLimitPause nowhere once this writer exists (slice 3).
    await writeLimitHold(tx, end.run); // task.limit_reached

    if (delivery !== 'wake') await writeLimitNotice(tx, end.run); // task.limit_notice wakes the starter
  }

  await writeRecord(tx, 'task.run_ended', { ...end, reportID, delivery }, { body }); // last
}

function pickDelivery(end): 'wake' | 'next_turn' | 'kept' {
  if (end.cause === 'no_work') return 'kept';

  if (targetHasFinished(end.run.report.target)) return 'kept'; // (open: finished target)

  if (end.run.report.mode === 'none') return 'kept';

  if (end.run.report.mode === 'next_turn') return 'next_turn';

  return insideHopLimit(end) ? 'wake' : 'next_turn'; // past the hop limit: the message, with wake: false
}

// ---- E. A call past its cap ----

async function checkCallCap(toolRun, tool) {
  const cap = toolRun.taskRun?.maxCalls[tool];

  if (cap === undefined) return;

  const used = await countRunCalls(context, toolRun.taskRun, tool); // result, queued, unknown, in flight

  if (used >= cap) {
    // A tool_result with the outcome `denied` and no decision. The tool never runs.
    return denied(`This run has used its ${cap} calls to ${tool}.`);
  }
}

// ---- F. A turn's budget counts late spend ----

// Built: createCallBudget(prices, leftDollars) returns { onCall, signal, getSpentDollars }, with a
// synchronous onCall. readTaskUsage(context, taskID, prices) returns TaskLimits and no sequence.
// Slice 1 changes both: the usage read also returns the sequence it ended at, and the budget takes
// a reader of late spend. The parameter list below is this sketch's reading.
function createCallBudget(prices, leftDollars, readLateSpend) {
  let spentDollars = 0;

  return {
    // Awaited: the host hands each call frame to the step before it reads the next frame.
    async onCall(usage) {
      if (prices === null) return;

      spentDollars += buildCallCost(usage, prices);

      // One indexed read per priced call: the task.failed_turn_spent records on the task's thread
      // past the sequence at which the turn's usage read ended. The worker slice adds the
      // worker.turn_ended records of worker runs that this step did not start.
      // (open: late spend scope)
      const lateDollars = await readLateSpend(); // a throw fails the step

      if (spentDollars >= leftDollars - lateDollars) reached.abort(); // the limit notice shows the true total
    },
  };
}

// ---- G. A start writes the brief ----

// Built: writeTaskStart(context, request) owns its write transaction and refuses a stale step
// through readLeasedStepHop. The body below is what that transaction does in the design.
async function writeTaskStart(context, request /* TaskStartRequest, with the hop limit */) {
  return withWriteTransaction(context.log, async (tx) => {
    const existing = await findTaskByStepAndName(tx, request.stepRunID, request.name);

    if (existing) return { status: 'started', taskID: existing.taskID }; // a rerun writes neither record again

    const briefMessageID = createShortID();

    await writeRecord(tx, 'task.created', { ...payload, briefMessageID }, { name: request.name });

    // Second, in the same transaction, on the started task's thread. A throw rolls task.created back.
    await writeBriefMessageInTransaction(
      tx,
      context,
      { hopLimit },
      {
        messageID: briefMessageID,
        from: request.from,
        to: taskID,
        body: request.brief,
      },
    );

    return { status: 'started', taskID }; // the task is `ready` and the brief unread
  });
}

// ---- H. The first message of a task run, and where the brief renders ----

// The order of the first message:
//   1. status
//   2. the memory blocks, only with memory: read: pinned-memory, memory-index, retrieved-memory,
//      retrieved-self-notes, retrieved-messages
//   3. the trigger block: only a definition's task run that a fire began
//   4. the report-shape block: only a task run that declares a report shape
//   5. the brief, as <task-message kind="request">

function pickBriefPlace(session, run, brief) {
  // A carried task run resumes the session that holds the brief of the task run it carries on.
  if (run?.carriesRunID && session.isFirstTurnOfRun && !session.isRebuilt) return 'nowhere';

  if (session.isRebuilt) {
    // pickPinnedBrief decides. Inside the recent turns: its own line there, at its sequence.
    // Outside them (a compaction, the token limit, a forget elsewhere), and for a task that an
    // older release started, a definition's task run and a carried task run: pinned in the
    // opening, after the memory blocks and before the summary. A definition's task pins only the
    // brief of the open task run. The blocks of the open task run are pinned with it, after the
    // memory blocks.
    return pickPinnedBrief(brief, session.window) ? 'pinned in the opening' : 'its own line';
  }

  switch (brief.origin) {
    case 'message':
      // Unread, the first turn: the inbox batch. pickTurnInbox(inbox, briefSequence) ends the
      // batch at the brief, in the session turn read and the turn batch read, so a message that
      // landed behind the brief waits for the next turn. (open: batch cut wake)
      return 'the inbox batch';
    case 'created':
      // A task that an older release started, first session.
      return "the last block of the turn's preamble";
    case 'definition':
      // A new session under `fresh`, the resumed one under `continuing`. After the trigger block
      // and the report-shape block. The inbox batch follows: the trigger.fired record, which
      // renders no text of its own, or the message that opened the task run.
      return "the last block of the turn's preamble";
  }
}

// The brief of a definition's task run is no record. readTaskBrief builds it:
//   body:      the `brief` of the version the task run pins, through readDefinitionVersion(definitionHash)
//   messageID: the briefID of task.run_opened
//   sentAt:    the task run's opening
//   label:     "task definition: {name}", with the version's name
// readTaskBriefs, for lists: the `brief` of the version in force, or of the version the open task
// run pins while the definition is out of force.

// ---- I. A message to a task: wake, wait or neither ----

function planTaskMessage(message, receiver, receiverRuns: boolean) {
  const asleep = !receiver.wakeable && receiver.state === 'waiting' && !receiver.hasOpenRun;

  if (asleep) {
    // Starts nothing, opens no wait. The message is held for the task's next task run.
    return { wake: false, opensWait: false, note: asleepNote };
  }

  const opensWait =
    (message.kind === 'question' || message.kind === 'request') &&
    (receiverRuns || receiver.wakeable);

  // A wakeable task that waits becomes ready, inside the hop limit. Past it, the message lands unread.
  const wake = receiver.wakeable && insideHopLimit(message);

  return { wake, opensWait };
}

function pickListedTaskState(task): ListedTaskState {
  if (task.state !== 'waiting') return task.state;

  if (task.hasOpenWait) return 'waiting';

  if (!task.wakeable) return 'asleep';

  // Reads the task_runs row, never the last sent message.
  return task.newestRun?.cause === 'reported' ? 'finished' : 'idle'; // open, none, or any other end: idle
}

// ---- J. One lookup from a task to its runner ----

async function resolve(context, taskID) {
  // (open: runner lookup order)
  // 1. A fixed task: the definition that lists it.
  // 2. A stored `runner` key: that key's definition. A key that names no definition: the step throws.
  // 3. A definition's task: the `runner` of the definition version its task holds, read through
  //    the reader that the definitions family passes in. With no reader passed in, skip this step.
  // 4. A started task or a definition's task that names none: the default.
  // 5. Any other task: null, and the `fallback` step runs.
}

// ---- K. One worker.run call ----

async function runWorkerCall(call, toolSession) {
  // 1. Every check, before any worker runs.
  const plan = planWorkerRun(call, toolSession); // refusals: 02-types.ts, section M

  if (plan.status === 'refused') return error(plan.sentence);

  // 2. The cap. The minutes count from the call's start, so this wait is inside them.
  if (cap && cap.isFull) {
    if (cap.whenFull === 'error') return error(workerEndSentences.capFull); // writes no worker record

    await cap.waitForSlot(); // first come, first served
  }

  // 3. Written before the sandbox is created.
  await writeRecord('worker.run_started', { ...plan, limits, isTaskLimit });

  // limits.dollars: the smaller of models.limits.workerRun.dollars and what the calling task has
  // left (hold.readLeftDollars()), read when the call starts.
  const sandbox = await createWorkerSandbox({
    kind: 'worker', // no egress, the profile's model grant and no other, and the tool route
    owner: `worker_run:${workerRunUUID}`, // never the calling task's ID
    image: imageOfHarness(workerProfile),
    size: 'systemTask',
    // The create has a time limit. A sandbox that arrives late is destroyed where it lands.
  });

  // 4. One fresh session with the question. Turn limit: the harness's turn-limit capability.
  for await (const modelCall of runSession(sandbox, plan.question)) {
    await writeRecord('worker.turn_ended', modelCall.usage, { text: modelCall.text });

    hold.onSpend(modelCall.dollars); // counts toward the calling turn's budget
  }

  // 5. The one ending block. Every way out passes it.
  await writeRecord('worker.run_ended', { outcome, limit, used });

  void destroySandbox(sandbox); // off the reply's path; the cap's slot is free once it ends

  return outcome === 'answered'
    ? { workerRunID, answer, used }
    : error(workerEndSentences[outcome]);
}

// The states of a worker run. Held in the process, never stored.
//   waiting  → starting : a slot under the cap is free, or no cap is set
//   waiting  → ended    : the cap is reached and the config says `error`; the minutes; an
//                         interrupt; the step is gone
//   starting → running  : the sandbox and the worker run's tool endpoint exist
//   starting → ended    : the sandbox failed; the minutes; an interrupt; the step is gone
//   running  → ended    : an answer; any of the 4 limits; a model failure; no answer; an
//                         interrupt; the step is gone
//
// The hard stop: the step's `signal`, or the minutes deadline. It stops the guest at once.
// The soft stop: the turn's `interrupt`, or the worker run's tokens or dollars. The guest ends
// its call and reports.
