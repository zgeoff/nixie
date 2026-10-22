import { onTestFinished } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LogRecord } from '@heynixie/log';
import type { ScriptedModel } from '@heynixie/testing';
import {
  readDescendants,
  startScriptedModel,
  stopProcesses,
  waitForCondition,
} from '@heynixie/testing';
import { z } from 'zod';
import { readDataFiles } from './read-data-files';
import { readTestRecords } from './read-test-records';
import type { BootFileExtras, BootFiles } from './write-boot-files';
import { writeBootFiles } from './write-boot-files';

export interface SpawnedNixieOptions {
  readonly extraConfig?: readonly string[];

  readonly extraSecrets?: readonly string[];

  readonly extraDefinitions?: readonly string[];

  readonly entry?: string;

  readonly logLevel?: NonNullable<BootFileExtras['logLevel']>;
}

export interface SpawnedNixie extends BootFiles {
  readonly directory: string;
  readonly model: ScriptedModel;

  readonly readOutput: () => string;

  readonly waitForLogEvent: (event: string) => Promise<Readonly<Record<string, unknown>>>;
  readonly sendSignal: (signal: NodeJS.Signals) => void;

  readonly sendStopSignal: () => Promise<void>;
  readonly exited: Promise<number>;

  readonly waitForExit: () => Promise<{ readonly exitCode: number; readonly records: LogRecord[] }>;

  readonly startAgain: () => SpawnedNixie;

  readonly readDataFiles: () => Promise<
    readonly { readonly name: string; readonly text: string }[]
  >;

  readonly readSandboxIDs: () => Promise<readonly string[]>;
}

export async function spawnTestNixie(options: SpawnedNixieOptions = {}): Promise<SpawnedNixie> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-main-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  stack.defer(() => model.stop());

  const files = await writeBootFiles(directory, model.url, {
    config: options.extraConfig ?? [],
    secrets: options.extraSecrets ?? [],
    definitions: options.extraDefinitions ?? [],
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),

    sandboxAdapter: options.entry === undefined ? 'test' : 'imp',
  });

  return startNixieRun({ directory, model, files, entry: options.entry, stack });
}

interface SpawnedNixieFiles {
  readonly directory: string;
  readonly model: ScriptedModel;
  readonly files: BootFiles;
  readonly entry: string | undefined;

  readonly stack: AsyncDisposableStack;
}

function startNixieRun(start: SpawnedNixieFiles): SpawnedNixie {
  const child = Bun.spawn([...buildCommand(start.entry), ...buildServeArgs(start.files)], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // A turn's guest and its Agent SDK process outlive a killed nixie, and one ran on for over 80 s
  // beside the next tests. Linux reparents them once nixie dies, so the tree is read first.
  start.stack.defer(async () => {
    const descendants = readDescendants(child.pid);

    child.kill('SIGKILL');

    stopProcesses(descendants);

    await child.exited;
  });

  return buildSpawnedNixie({ ...start, child, startAgain: () => startNixieRun(start) });
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

    '--encoder',
    '',
  ];
}

interface SpawnedNixieParts {
  readonly directory: string;
  readonly model: ScriptedModel;
  readonly files: BootFiles;
  readonly child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  readonly startAgain: () => SpawnedNixie;
}

function buildSpawnedNixie(parts: SpawnedNixieParts): SpawnedNixie {
  const output = buildOutput();
  const waitForLogEvent = makeLogEventWaiter(() => parts.child.exitCode, output);

  void pipeOutput(parts.child.stdout, output);
  void pipeOutput(parts.child.stderr, output);

  return {
    ...parts.files,
    directory: parts.directory,
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
): SpawnedNixie['waitForLogEvent'] {
  return async (event) => {
    const findLine = () => parseLogLines(output.read()).find((line) => line['event'] === event);

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

const logLineSchema = z.record(z.string(), z.unknown()).readonly();

function parseLogLines(text: string): readonly Readonly<Record<string, unknown>>[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => logLineSchema.parse(JSON.parse(line)));
}

async function pipeOutput(stream: ReadableStream<Uint8Array>, output: Output): Promise<void> {
  const decoder = new TextDecoder();

  for await (const chunk of stream) {
    output.append(decoder.decode(chunk, { stream: true }));
  }
}
