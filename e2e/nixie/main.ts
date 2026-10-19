import { startActionRunners, writeUnknownOutcomes } from '@heynixie/actions';
import { StaleWriterError, subscribeToRecords } from '@heynixie/log';
import { startLineLog } from '@heynixie/logger';
import type { RunnerPool, StepInput, StepResult } from '@heynixie/tasks';
import {
  createConversationTask,
  runRecovery,
  setFaultPointHandler,
  startTaskRunners,
} from '@heynixie/tasks';
import { readDescendants, startHarnessLink, stopProcesses } from '@heynixie/testing';
import { readNixieEnv } from './read-nixie-env';
import { registerHarnessOperations } from './register-harness-operations';
import { runTestTaskStep } from './run-test-task-step';
import { startTestLog } from './start-test-log';
import { startTestSessions } from './start-test-sessions';
import { startTestTools } from './start-test-tools';

// The test build of nixie that the crash tests run as a child process, on the paths and endpoints
// the harness passes: the writer, recovery, the conversation and memory's writer on scripted
// models, the tool endpoint with test.send, and the runners, on the harness's one clock.
const env = readNixieEnv(process.env);

// the conversation's events go to stderr, as JSON lines, for a reader of a failed run
await startLineLog((line) => {
  process.stderr.write(line);
});

const link = startHarnessLink();

setFaultPointHandler((id, work) => link.waitAtFaultPoint(id, work));

const testLog = await startTestLog({
  dataDir: env.dataDir,
  deploymentKey: env.deploymentKey,
  clock: link.clock,
}).catch(stopWithError);

const context = testLog.context;

await createConversationTask(context).catch(stopWithError);

await runRecovery(context, {
  writeUnknownOutcomes: () => writeUnknownOutcomes(context),

  // slice 2 cleans up the sandboxes of steps that no longer run
  sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
}).catch(stopWithError);

// the oracle reads what this restart's recovery left, before any runner claims work
await link.waitAtFaultPoint('test.recovered', { kind: 'recovery', id: null });

const tools = await startTestTools(context, env.providerURL).catch(stopWithError);

const sessions = await startTestSessions(context, tools, {
  modelURL: env.modelURL,
  writerModelURL: env.writerModelURL,
}).catch(stopWithError);

const holder = `nixie-${process.pid}`;

const tasks = startTaskRunners(context, {
  runStep: tools.trackSteps(runTestBuildStep),
  onStepErrored: () => {},
  onError: stopWithError,
  holder,
});

const actions = startActionRunners(context, {
  connectors: tools.connectors,
  onError: stopWithError,
  holder,
});

const stopping = new AbortController();

startRecordWakes([tasks, actions], stopping.signal);
registerHarnessOperations(link, context);

// a graceful stop claims nothing new and gives the steps in flight the grace window to commit
process.once('SIGTERM', () => {
  stopping.abort();
  void stopGracefully();
});

link.sendReady();

// the conversation and the memory writer run their sessions in guests, and every other task is a
// test task
function runTestBuildStep(input: StepInput): Promise<StepResult> {
  const runStep = sessions.steps[input.taskID];

  return runStep === undefined
    ? Promise.resolve(runTestTaskStep(link.clock, input))
    : runStep(input);
}

async function stopGracefully(): Promise<void> {
  await Promise.all([tasks.stop(), actions.stop()]);
  await sessions.stop();
  await tools.endpoint.stop();
  await testLog.writer.stop();

  stopProcessTree(0);
}

// A failure that stops nixie, such as a writer lock another process holds or a stale writer epoch,
// ends the process with its message on stderr and a non-zero code.
function stopWithError(error: unknown): never {
  const kind = error instanceof StaleWriterError ? 'stale writer' : 'nixie stopped';

  process.stderr.write(`${kind}: ${error instanceof Error ? error.message : String(error)}\n`);

  stopProcessTree(1);
}

// A guest leads its own process group, so it outlives a nixie that exits. A host that loses nixie
// loses its sandboxes too, so the test build kills every process it started before it exits.
function stopProcessTree(code: number): never {
  stopProcesses(readDescendants(process.pid));

  process.exit(code);
}

// The test build's stand-in for the commit wake that the server wires: a record that changed a
// projection row can make work claimable, so it wakes the runners, and a second wake shortly after
// catches a runner that was mid-claim at the first.
function startRecordWakes(pools: readonly RunnerPool[], signal: AbortSignal): void {
  const emitWakes = (): void => {
    for (const pool of pools) {
      pool.wake();
    }
  };

  void (async () => {
    for await (const entry of subscribeToRecords(context.log, { afterSequence: 0, signal })) {
      if (entry.changes.length > 0) {
        emitWakes();
        setTimeout(emitWakes, followUpWakeMs);
      }
    }
  })();
}

const followUpWakeMs = 20;
