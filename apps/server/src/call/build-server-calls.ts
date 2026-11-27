import type { Call, CallsContext, SpeechLayer, VoiceConfig } from '@heynixie/calls';
import {
  buildCallRuntime,
  defaultVoicePrompt,
  readVoiceDefinitions,
  renderNoSummaryReport,
} from '@heynixie/calls';
import type { Clock } from '@heynixie/clock';
import type { Definitions, Log, WriteTransaction } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { TaskMessaging, TaskState, TasksContext, TasksTables } from '@heynixie/tasks';
import {
  conversationTaskID,
  writeCallTask,
  writeTaskControl,
  writeTaskMessageInTransaction,
} from '@heynixie/tasks';
import type { InForce } from '../types';

export interface ServerCallsOptions {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly budgets: CallsContext['budgets'];
  readonly inForce: InForce;

  readonly voice: VoiceConfig;
  readonly logEvent: Logger;

  // null where the server wires no adapter, as when the voice credential is missing
  readonly speech: SpeechLayer | null;

  // the conversation's place in the task directory, which a call's report goes to
  readonly messaging: Pick<TaskMessaging, 'directory' | 'hopLimit'>;

  // what the call's task and the cut of its turn need
  readonly tasks: Pick<
    TasksContext,
    'log' | 'clock' | 'definitions' | 'runSettings' | 'runners' | 'queueRunnerActions'
  >;
}

// The calls module's context. `calls.start` answers SPEECH_UNAVAILABLE for a configured voice
// while `speech` is null.
export function buildServerCalls(options: ServerCallsOptions): CallsContext {
  return {
    log: options.log,
    clock: options.clock,
    definitions: options.definitions,
    logEvent: options.logEvent,
    budgets: options.budgets,
    voice: options.voice,
    speech: options.speech,
    readVoiceDefinitions: () => readVoiceDefinitions(options.inForce.read()?.sections ?? {}),
    createTask: (tx, input) => writeCallTask(tx, options.tasks, input),
    readInstructions: () => Promise.resolve(defaultVoicePrompt),
    interruptTurn: async (taskID) => {
      await writeTaskControl(options.tasks, { taskID, control: 'interrupt' });
    },
    writeStrandedReport: (tx, call) => writeStrandedReport(tx, options, call),
    runtime: buildCallRuntime(),
    sessions: new Map(),
    openings: new Set(),
  };
}

// The states in which a task takes no more steps until someone acts on it, so a closing marker
// would wait unread.
const strandedStates: ReadonlySet<TaskState> = new Set(['failed', 'stopped', 'done', 'closed']);

// A call whose task can run no closing turn gets its report here, with no summary, once: in the
// transaction that ends the call, or from the sweep when the task stopped after the call ended.
async function writeStrandedReport(
  tx: WriteTransaction,
  options: ServerCallsOptions,
  call: Pick<Call, 'callID' | 'taskID'>,
): Promise<boolean> {
  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', call.taskID)
    .executeTakeFirst();

  if (task === undefined || !strandedStates.has(task.state)) {
    return false;
  }

  const earlier = await tx
    .$extendTables<TasksTables>()
    .selectFrom('task_messages')
    .select('message_id')
    .where('from_task', '=', call.taskID)
    .where('kind', '=', 'report')
    .executeTakeFirst();

  if (earlier !== undefined) {
    return false;
  }

  const sent = await writeTaskMessageInTransaction(
    tx,
    options.tasks,
    {
      from: call.taskID,
      to: conversationTaskID,
      kind: 'report',
      body: renderNoSummaryReport(call.callID, call.taskID),
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
    { messaging: options.messaging, senderHop: 0, stepKey: `${call.taskID}:end` },
  );

  return sent.status === 'sent';
}
