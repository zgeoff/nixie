import { onTestFinished } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LogRecord } from '@heynixie/log';
import type { ScriptedModel } from '@heynixie/testing';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { readDataFiles } from './read-data-files';
import { readTestRecords } from './read-test-records';
import type { BootFiles } from './write-boot-files';
import { writeBootFiles } from './write-boot-files';

export interface TestNixieOptions {
  // YAML lines appended to the configuration file, such as a key no module reads
  readonly extraConfig?: readonly string[];

  // YAML lines appended to the secrets file, such as a private setting the configuration names
  readonly extraSecrets?: readonly string[];

  // a release bundle's main.js to run in place of a test build of the source
  readonly entry?: string;
}

export interface TestNixie extends BootFiles {
  readonly dir: string;
  readonly model: ScriptedModel;

  // every line nixie wrote to stdout and stderr so far
  readonly readOutput: () => string;

  // waits for the first JSON log line with the event, and returns it
  readonly waitForLogEvent: (event: string) => Promise<Readonly<Record<string, unknown>>>;
  readonly sendSignal: (signal: NodeJS.Signals) => void;

  // sends SIGTERM and waits until nixie logs that its stop began
  readonly sendStopSignal: () => Promise<void>;
  readonly exited: Promise<number>;

  // waits for nixie to exit, then reads every record with its decrypted fields
  readonly waitForExit: () => Promise<{ readonly exitCode: number; readonly records: LogRecord[] }>;

  // starts nixie again on the same files and data directory, as the container runtime restarts it
  // once it exits, with an output of its own
  readonly startAgain: () => TestNixie;

  // each file at the data directory's root, such as nixie.db and keys.db, as latin1 text
  readonly readDataFiles: () => Promise<
    readonly { readonly name: string; readonly text: string }[]
  >;

  // the ID of each sandbox whose disk the process double holds in the data directory
  readonly readSandboxIDs: () => Promise<readonly string[]>;
}

// Starts nixie as its own process the way the image runs it: a test build of the source, or the
// release bundle that entry names, beside the scripted model and a sops stand-in. When the test
// finishes it kills nixie if it still runs, stops the model and removes the directory.
export async function startTestNixie(options: TestNixieOptions = {}): Promise<TestNixie> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-main-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const files = await writeBootFiles(dir, model.url, {
    config: options.extraConfig ?? [],
    secrets: options.extraSecrets ?? [],
  });

  return startNixieRun({ dir, model, files, entry: options.entry, stack });
}

interface TestNixieFiles {
  readonly dir: string;
  readonly model: ScriptedModel;
  readonly files: BootFiles;
  readonly entry: string | undefined;

  // the test's cleanup, which kills each nixie it started before it removes the directory
  readonly stack: AsyncDisposableStack;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a disposable stack has no readonly form
function startNixieRun(start: TestNixieFiles): TestNixie {
  const child = Bun.spawn([...buildCommand(start.entry), ...buildServeArgs(start.files)], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  start.stack.defer(async () => {
    child.kill('SIGKILL');
    await child.exited;
  });
  return buildTestNixie({ ...start, child, startAgain: () => startNixieRun(start) });
}

function buildCommand(entry: string | undefined): readonly string[] {
  return entry === undefined
    ? [process.execPath, '--define', 'NIXIE_TEST_BUILD=true', join(import.meta.dir, '../main.ts')]
    : [process.execPath, entry];
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
  ];
}

interface TestNixieParts {
  readonly dir: string;
  readonly model: ScriptedModel;
  readonly files: BootFiles;
  readonly child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  readonly startAgain: () => TestNixie;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a subprocess handle has no readonly form
function buildTestNixie(parts: TestNixieParts): TestNixie {
  const output = buildOutput();
  const waitForLogEvent = makeLogEventWaiter(() => parts.child.exitCode, output);

  void collectOutput(parts.child.stdout, output);
  void collectOutput(parts.child.stderr, output);
  return {
    ...parts.files,
    dir: parts.dir,
    model: parts.model,
    readOutput: output.read,
    waitForLogEvent,
    sendSignal: (signal) => {
      parts.child.kill(signal);
    },
    sendStopSignal: async () => {
      parts.child.kill('SIGTERM');
      await waitForLogEvent('stopping');
    },
    exited: parts.child.exited,
    waitForExit: async () => {
      const exitCode = await parts.child.exited;
      const records = await readTestRecords(parts.files.dataDir, parts.files.deploymentKey);

      return { exitCode, records };
    },
    readDataFiles: () => readDataFiles(parts.files.dataDir),
    readSandboxIDs: () => readdir(join(parts.files.dataDir, 'sandboxes')),
    startAgain: parts.startAgain,
  };
}

// everything nixie wrote to stdout and stderr, in the order it arrived
interface Output {
  readonly read: () => string;
  readonly append: (text: string) => void;
}

function buildOutput(): Output {
  const current = { text: '' };

  return {
    read: () => current.text,
    append: (text) => {
      current.text += text;
    },
  };
}

function makeLogEventWaiter(
  readExitCode: () => number | null,
  output: Output,
): TestNixie['waitForLogEvent'] {
  return async (event) => {
    const findLine = () => readLogLines(output.read()).find((line) => line['event'] === event);

    await waitForCondition(() => findLine() !== undefined || readExitCode() !== null, {
      timeoutMs: 30_000,
    });
    const line = findLine();

    if (line === undefined) {
      throw new Error(`nixie exited without the log event ${event}:\n${output.read()}`);
    }
    return line;
  };
}

async function collectOutput(stream: ReadableStream<Uint8Array>, output: Output): Promise<void> {
  const decoder = new TextDecoder();

  for await (const chunk of stream) {
    output.append(decoder.decode(chunk, { stream: true }));
  }
}

const logLineSchema = z.record(z.string(), z.unknown()).readonly();

function readLogLines(text: string): readonly Readonly<Record<string, unknown>>[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => logLineSchema.parse(JSON.parse(line)));
}
