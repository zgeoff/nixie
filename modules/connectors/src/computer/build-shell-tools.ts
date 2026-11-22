import { createShortID } from '@heynixie/db';
import { actionProposalLapseMs } from '@heynixie/policy';
import type { DirectResult, ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { CodeFilesTables } from '../code/code-files-tables';
import { pickMediaType } from '../code/pick-media-type';
import type { ComputerState } from './computer-state';
import { buildActionKey } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';
import {
  makeActionScans,
  refuseComputer,
  runComputerCall,
  sortCallResult,
} from './run-computer-call';
import type { ComputerAttempt } from './types';

// The tools of the shell: run, read_file, write_file and export_file.
export function buildShellTools(
  options: ComputerToolOptions,
  state: ComputerState,
): readonly ToolDefinition[] {
  return [
    buildRunTool(options, state),
    buildReadFileTool(options),
    buildWriteFileTool(options, state),
    buildExportFileTool(options),
  ];
}

const diskNote = [
  'The shell has a disk of its own under ~/files, which is working space, not a store: ',
  'isDiskNew is true when the disk is empty, so you know what it held before is gone. ',
  'The shell reaches the web only through nixie’s checks, one site at a time.',
].join('');

function buildRunTool(options: ComputerToolOptions, state: ComputerState): ToolDefinition {
  return {
    name: 'computer.run',
    description: [
      'Runs one bash command in your own shell, in ~/files, and returns its exit code and output ',
      '(each stream is cut at 64 KiB). The call waits for the owner to allow the command, which ',
      'an owner can allow once or for every command that starts with the same words. A ',
      'computer.write_file, a computer.download or another computer.run that finishes before ',
      'this one starts cancels it with FILES_CHANGED, so check what it ran against. ',
      diskNote,
    ].join(''),
    input: {
      type: 'object',
      properties: {
        command: { type: 'string', minLength: 1 },
        timeoutSeconds: { type: 'integer', minimum: 1, maximum: 300 },
      },
      required: ['command'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        exitCode: { type: ['number', 'null'] },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        isStdoutCut: { type: 'boolean' },
        isStderrCut: { type: 'boolean' },
        seconds: { type: 'number' },
        isDiskNew: { type: 'boolean' },
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['computer_run'],
      destinations: [],
      amount: null,
      content: ['command'],
      results: {
        exitCode: 'untrusted',
        stdout: 'untrusted',
        stderr: 'untrusted',
        isStdoutCut: 'owner_data',
        isStderrCut: 'owner_data',
        seconds: 'owner_data',
        isDiskNew: 'owner_data',
        refused: 'untrusted',
      },
    },
    execution: 'queued',
    prepare: (input) => {
      const key = buildActionKey('computer.run', input);

      state.epochs.set(key, state.files.count);
      state.holds.get(key)?.();
      state.holds.set(key, options.computer.hold('shell', actionProposalLapseMs));

      return Promise.resolve({ destinations: [] });
    },
    run: () => Promise.resolve({ status: 'error', message: 'computer.run runs only queued' }),
  };
}

const pathArguments = z.object({ path: z.string().min(1) });
const callTimeoutMs = 30_000;

function buildReadFileTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.read_file',
    description: [
      'Reads a text file from the shell’s disk, by a path under ~/files. A file past 25 MiB or ',
      'one that is not text is refused. ',
      diskNote,
    ].join(''),
    input: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1 } },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        text: { type: 'string' },
        isDiskNew: { type: 'boolean' },
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        path: 'owner_data',
        text: 'untrusted',
        isDiskNew: 'owner_data',
        refused: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = pathArguments.parse(call.input);

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'shell',
        namedURL: null,
        timeoutMs: callTimeoutMs,
        request: { op: 'readFile', path: input.path },
      });

      if (outcome.kind === 'refused') {
        return { status: 'ok', ...outcome.result };
      }

      if (outcome.reply.kind !== 'file') {
        return { status: 'ok', ...refuseComputer('COMPUTER_FAILED', 'wrong kind of reply') };
      }

      const bytes = Buffer.from(outcome.reply.base64, 'base64');

      if (!isText(bytes)) {
        return {
          status: 'ok',
          ...refuseComputer('NOT_TEXT', 'the file is not text; use computer.export_file'),
        };
      }

      return {
        status: 'ok',
        result: {
          path: input.path,
          text: bytes.toString('utf8'),
          isDiskNew: outcome.reply.isDiskNew,
        },
      };
    },
  };
}

function isText(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);

    return !bytes.includes(0);
  } catch {
    return false;
  }
}

const writeArguments = z.object({ path: z.string().min(1), text: z.string() });
const defaultRunSeconds = 60;

function buildWriteFileTool(options: ComputerToolOptions, state: ComputerState): ToolDefinition {
  return {
    name: 'computer.write_file',
    description: [
      'Writes a text file to the shell’s disk, by a path under ~/files, and replaces a file ',
      'there. Any computer.run that is waiting for the owner is cancelled with FILES_CHANGED. ',
      diskNote,
    ].join(''),
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1 },
        text: { type: 'string' },
      },
      required: ['path', 'text'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        bytes: { type: 'number' },
        isDiskNew: { type: 'boolean' },
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        path: 'owner_data',
        bytes: 'owner_data',
        isDiskNew: 'owner_data',
        refused: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = writeArguments.parse(call.input);

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'shell',
        namedURL: null,
        timeoutMs: callTimeoutMs,
        request: {
          op: 'writeFile',
          path: input.path,
          base64: Buffer.from(input.text, 'utf8').toString('base64'),
        },
      });

      state.files.count += 1;

      if (outcome.kind === 'refused') {
        return { status: 'ok', ...outcome.result };
      }

      if (outcome.reply.kind !== 'written') {
        return { status: 'ok', ...refuseComputer('COMPUTER_FAILED', 'wrong kind of reply') };
      }

      return {
        status: 'ok',
        result: {
          path: outcome.reply.path,
          bytes: outcome.reply.bytes,
          isDiskNew: outcome.reply.isDiskNew,
        },
      };
    },
  };
}

// The result has the shape of a code run's result, so file.send sends the exported file.
function buildExportFileTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.export_file',
    description: [
      'Takes a file from the shell’s disk, by a path under ~/files, and keeps it with this ',
      'result, so file.send can send it to the owner. A file past 25 MiB is refused. ',
      diskNote,
    ].join(''),
    input: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1 } },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        stdout: { type: 'object' },
        stderr: { type: 'object' },
        files: { type: 'array' },
        isDiskNew: { type: 'boolean' },
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        stdout: 'owner_data',
        stderr: 'owner_data',
        files: 'untrusted',
        isDiskNew: 'owner_data',
        refused: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = pathArguments.parse(call.input);

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'shell',
        namedURL: null,
        timeoutMs: callTimeoutMs,
        request: { op: 'readFile', path: input.path },
      });

      if (outcome.kind === 'refused') {
        return { status: 'ok', ...outcome.result };
      }

      if (outcome.reply.kind !== 'file') {
        return { status: 'ok', ...refuseComputer('COMPUTER_FAILED', 'wrong kind of reply') };
      }

      const bytes = new Uint8Array(Buffer.from(outcome.reply.base64, 'base64'));

      const file = createShortID();
      const mediaType = pickMediaType(input.path, bytes);

      return {
        status: 'ok',
        result: {
          stdout: { file: null },
          stderr: { file: null },
          files: [{ file, path: input.path, bytes: bytes.byteLength, mediaType, isShown: false }],
          isDiskNew: outcome.reply.isDiskNew,
        },
        attachments: [bytes],
        writeBeside: async (tx, sequence) => {
          await tx
            .$extendTables<CodeFilesTables>()
            .insertInto('code_files')
            .values({
              file_id: file,
              thread: context.run.thread,
              sequence,
              position: 0,
              bytes: bytes.byteLength,
              media_type: mediaType,
            })
            .execute();
        },
      };
    },
  };
}

const runArguments = z.object({
  command: z.string().min(1),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
});

// The attempt of a queued run: the command, unless a write to the disk came first.
export async function runShellCommand(
  options: ComputerToolOptions,
  state: ComputerState,
  attempt: Pick<ComputerAttempt, 'arguments'>,
): Promise<DirectResult> {
  const input = runArguments.parse(attempt.arguments);
  const key = buildActionKey('computer.run', attempt.arguments);
  const epoch = state.epochs.get(key);

  state.holds.get(key)?.();
  state.holds.delete(key);
  state.epochs.delete(key);

  if (epoch !== state.files.count) {
    return refuseComputer(
      'FILES_CHANGED',
      'the files changed after this command was asked for, so it did not run; ask again',
    );
  }

  const seconds = input.timeoutSeconds ?? defaultRunSeconds;

  const called = await options.computer.call('shell', {
    timeoutMs: (seconds + 30) * 1000,
    ...makeActionScans(options),
    request: { op: 'run', argv: ['bash', '-lc', input.command], timeoutSeconds: seconds },
  });

  const outcome = sortCallResult(called, 'shell');

  state.files.count += 1;

  if (outcome.kind === 'refused') {
    return outcome.result;
  }

  if (outcome.reply.kind !== 'run') {
    return refuseComputer('COMPUTER_FAILED', 'the shell answered with the wrong kind of reply');
  }

  const run = outcome.reply.run;

  return {
    result: {
      exitCode: run.exitCode,
      stdout: run.stdout.text,
      stderr: run.stderr.text,
      isStdoutCut: run.stdout.isCut,
      isStderrCut: run.stderr.isCut,
      seconds: run.seconds,
      isDiskNew: run.isDiskNew,
    },
  };
}
