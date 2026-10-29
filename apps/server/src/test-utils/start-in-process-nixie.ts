import { onTestFinished } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countTextTokens } from '@heynixie/compaction';
import type { LogRecord } from '@heynixie/log';
import { startWriter } from '@heynixie/log';
import type { LogFields, LogLevel, Logger } from '@heynixie/logger';
import type { SandboxRecorder, ToolTargetResolver } from '@heynixie/sandbox';
import type { ReceivedFrame, StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import { buildStubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { ScriptedModel } from '@heynixie/testing';
import { createRunTemplate, startScriptedModel, waitForCondition } from '@heynixie/testing';
import { readTestToolNames, sendTestToolCall } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import type { SandboxAdapterOptions } from '../create-sandbox-adapter';
import { runCLI } from '../run-cli';
import { readDataFiles } from './read-data-files';
import { readTestRecords } from './read-test-records';
import type { BootFileExtras, BootFiles } from './write-boot-files';
import { writeBootFiles } from './write-boot-files';
import { writeMigratedData } from './write-migrated-data';

export interface InProcessNixieOptions {
  readonly extraConfig?: readonly string[];

  readonly extraSecrets?: readonly string[];

  readonly extraDefinitions?: readonly string[];

  readonly logLevel?: NonNullable<BootFileExtras['logLevel']>;
}

type TestLogEvent = Readonly<Record<string, unknown>> & {
  readonly event: string;
  readonly level: LogLevel;
};

interface TestToolResult {
  readonly name: string;

  readonly result: string;
}

type RunBeforeCleanup = <T>(work: () => Promise<T>) => Promise<T>;

export interface InProcessNixie extends BootFiles {
  readonly directory: string;
  readonly model: ScriptedModel;

  readonly guest: StubGuestSandboxes;

  readonly toolResults: readonly TestToolResult[];

  readonly readToolNames: (received: ReceivedFrame) => Promise<readonly string[]>;

  readonly readLogEvents: () => readonly TestLogEvent[];

  readonly waitForLogEvent: (event: string) => Promise<TestLogEvent>;

  readonly signalStop: () => void;
  readonly exited: Promise<number>;

  readonly waitForExit: () => Promise<{ readonly exitCode: number; readonly records: LogRecord[] }>;

  readonly startAgain: () => InProcessNixie;

  readonly readRuns: () => readonly InProcessNixie[];

  readonly runBeforeCleanup: RunBeforeCleanup;

  readonly readDataFiles: () => Promise<
    readonly { readonly name: string; readonly text: string }[]
  >;
}

export function startInProcessNixie(options: InProcessNixieOptions = {}): Promise<InProcessNixie> {
  const stack = new AsyncDisposableStack();

  const runBeforeCleanup = makeRunBeforeCleanup(stack);

  return runBeforeCleanup(() => startFirstRun(options, stack, runBeforeCleanup));
}

// Bun reports a rejection that reaches a timed-out test's body as an unhandled error, so work that
// ends after the test finished never settles for its caller.
function makeRunBeforeCleanup(stack: AsyncDisposableStack): RunBeforeCleanup {
  const running = new Set<Promise<unknown>>();

  const state = { hasFinished: false };

  onTestFinished(async () => {
    state.hasFinished = true;

    await Promise.allSettled(running);
    await stack.disposeAsync();
  });

  return async (work) => {
    if (state.hasFinished) {
      return Promise.withResolvers<never>().promise;
    }

    const started = work();

    running.add(started);

    const [settled] = await Promise.allSettled([started]);

    running.delete(started);

    if (state.hasFinished) {
      return Promise.withResolvers<never>().promise;
    }

    if (settled.status === 'rejected') {
      throw settled.reason;
    }

    return settled.value;
  };
}

async function startFirstRun(
  options: InProcessNixieOptions,
  stack: AsyncDisposableStack,
  runBeforeCleanup: RunBeforeCleanup,
): Promise<InProcessNixie> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-main-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const files = await writeBootFiles(directory, model.url, {
    config: options.extraConfig ?? [],
    secrets: options.extraSecrets ?? [],
    definitions: options.extraDefinitions ?? [],
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
  });

  await writeMigratedData(files.dataDir, {
    createTemplate: createRunTemplate,
    startWriter,
    copyDirectory: (from, to) => cp(from, to, { recursive: true }),
  });

  const host = buildRunHost();
  const toolResults: TestToolResult[] = [];

  const guest = buildStubGuestSandboxes({
    recorder: host.recorder,
    callTool: async (call) => {
      const result = await sendTestToolCall({
        target: host.toolTarget({ id: call.sandboxID, owner: call.owner }),
        token: call.token,
        name: call.name,
        input: call.input,
      });

      toolResults.push({ name: call.name, result });

      return result;
    },
    countTokens: countTextTokens,
  });

  return startNixieRun({
    directory,
    model,
    files,
    guest,
    toolResults,
    host,
    stack,
    runBeforeCleanup,
    runs: [],
  });
}

interface RunHost {
  readonly recorder: SandboxRecorder;
  readonly toolTarget: ToolTargetResolver;

  readonly attach: (options: SandboxAdapterOptions) => void;
}

// The stub guest outlives each run, as a sandbox host outlives nixie, so it reaches the recorder and
// the tool endpoint of the run that started last.
function buildRunHost(): RunHost {
  const current: { options: SandboxAdapterOptions | null } = { options: null };

  const getOptions = () => {
    invariant(current.options, 'no nixie run has created its sandbox adapter');

    return current.options;
  };

  return {
    recorder: {
      write: (event) => getOptions().recorder.write(event),
      readRow: (adapter, sandboxID) => getOptions().recorder.readRow(adapter, sandboxID),
      list: (adapter, owner) => getOptions().recorder.list(adapter, owner),
    },
    toolTarget: (sandbox) => getOptions().toolTarget(sandbox),
    attach: (options) => {
      current.options = options;
    },
  };
}

interface InProcessNixieFiles {
  readonly directory: string;
  readonly model: ScriptedModel;
  readonly files: BootFiles;
  readonly guest: StubGuestSandboxes;
  readonly toolResults: readonly TestToolResult[];
  readonly host: RunHost;

  readonly stack: AsyncDisposableStack;
  readonly runBeforeCleanup: RunBeforeCleanup;

  readonly runs: InProcessNixie[];
}

function startNixieRun(start: InProcessNixieFiles): InProcessNixie {
  const events: TestLogEvent[] = [];
  const stopSignal = Promise.withResolvers<string>();
  const state = { hasExited: false };

  const log: Logger = (event, fields: LogFields = {}, level = 'info') => {
    events.push({ ...fields, event, level });
  };

  const runServe = async () => {
    try {
      return await runCLI(buildServeArgs(start.files), {
        log,
        print: () => {},
        waitForSignal: () => stopSignal.promise,
        createSandboxAdapter: (options) => {
          start.host.attach(options);

          return start.guest.adapter;
        },
      });
    } finally {
      state.hasExited = true;
    }
  };

  const exited = runServe();
  const findEvent = (event: string) => events.find((logged) => logged.event === event);

  const run: InProcessNixie = {
    ...start.files,
    directory: start.directory,
    model: start.model,
    guest: start.guest,
    toolResults: start.toolResults,
    readToolNames: (received) => {
      invariant(received.frame.type === 'turn', 'only a turn frame carries a tool route');

      return readTestToolNames({
        target: start.host.toolTarget({ id: received.sandboxID, owner: received.owner }),
        token: received.frame.tools.token,
      });
    },
    readLogEvents: () => events,
    waitForLogEvent: async (event) => {
      await waitForCondition(() => findEvent(event) !== undefined || state.hasExited);

      const logged = findEvent(event);

      if (logged === undefined) {
        throw new Error(`nixie exited without the log event ${event}`);
      }

      return logged;
    },
    signalStop: () => {
      stopSignal.resolve('SIGTERM');
    },
    exited,
    waitForExit: async () => {
      const exitCode = await exited;
      const records = await readTestRecords(start.files.dataDir, start.files.deploymentKey);

      return { exitCode, records };
    },
    readDataFiles: () => readDataFiles(start.files.dataDir),
    startAgain: () => startNixieRun(start),
    readRuns: () => start.runs,
    runBeforeCleanup: start.runBeforeCleanup,
  };

  start.runs.push(run);

  start.stack.defer(async () => {
    stopSignal.resolve('SIGTERM');

    await exited;
  });

  return run;
}

function buildServeArgs(files: BootFiles): readonly string[] {
  return [
    'serve',
    '--config',
    files.configPath,
    '--manifest',
    files.manifestPath,
    '--sops',
    files.sopsPath,

    '--encoder',
    '',
  ];
}
