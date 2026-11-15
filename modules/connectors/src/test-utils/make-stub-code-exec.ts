import type { CollectedOutput, ExecResult } from '@heynixie/sandbox';
import type { StubExec } from './build-stub-sandbox-adapter';

type StubBytes = string | Uint8Array<ArrayBuffer>;

// What a stand-in program did, as data.
export interface StubProgramScript {
  readonly stdout?: StubBytes;

  // the bytes the program wrote to stdout, when more than the collected ones
  readonly stdoutTotal?: number;
  readonly isStdoutCut?: boolean;
  readonly stderr?: StubBytes;
  readonly stderrTotal?: number;
  readonly isStderrCut?: boolean;
  readonly code?: number | null;
  readonly signal?: string | null;
  readonly durationMs?: number;

  // files the program wrote, by path in the work folder, such as out/totals.csv
  readonly writes?: Readonly<Record<string, StubBytes>>;

  // the program runs until the exec's signal aborts, and then ends on SIGTERM
  readonly isHanging?: boolean;

  // the program waits for this before it ends
  readonly until?: Promise<void>;
}

export interface StubProgramContext {
  readonly argv: readonly string[];
  readonly cwd: string | undefined;
  readonly files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}

export type StubProgram = (context: StubProgramContext) => StubProgramScript;

export interface StubCodeExecOptions {
  // the listing of out/ stops at this many bytes of output, as the exec cap does
  readonly listingCutBytes?: number;

  // files that appear in the work folder after the listing of out/, as when a detached process
  // grows one
  readonly growAfterListing?: Readonly<Record<string, StubBytes>>;
}

// The exec of a code sandbox: the setup answers success, the program runs the script that the
// stand-in returns, and the listing of out/ reports the files the program wrote.
export function makeStubCodeExec(
  program: StubProgram,
  options: StubCodeExecOptions = {},
): StubExec {
  return async (command, ctx, signal) => {
    const [first] = command.argv;

    if (first === 'sh') {
      return buildExecResult({});
    }

    if (first === 'find') {
      const listing = buildListing(ctx.files, options.listingCutBytes);

      for (const [path, content] of Object.entries(options.growAfterListing ?? {})) {
        ctx.files.set(`/work/${path}`, toBytes(content));
      }

      return listing;
    }

    if (first !== 'setpriv') {
      throw new Error(`the stub code exec runs no ${first ?? 'empty command'}`);
    }

    const script = program({ argv: command.argv, cwd: command.cwd, files: ctx.files });

    for (const [path, content] of Object.entries(script.writes ?? {})) {
      ctx.files.set(`/work/${path}`, toBytes(content));
    }

    if (script.isHanging === true) {
      await waitForAbort(signal);

      return buildExecResult({ ...script, code: null, signal: 'SIGTERM' });
    }

    await script.until;

    return buildExecResult(script);
  };
}

function buildExecResult(script: StubProgramScript): ExecResult {
  return {
    code: script.code === undefined ? 0 : script.code,
    signal: script.signal ?? null,
    stdout: buildOutput(script.stdout ?? '', script.stdoutTotal, script.isStdoutCut),
    stderr: buildOutput(script.stderr ?? '', script.stderrTotal, script.isStderrCut),
    durationMs: script.durationMs ?? 1000,
  };
}

function buildOutput(content: StubBytes, total?: number, isCut?: boolean): CollectedOutput {
  const bytes = toBytes(content);

  return { bytes, totalBytes: total ?? bytes.byteLength, isCut: isCut ?? false };
}

function toBytes(content: StubBytes): Uint8Array<ArrayBuffer> {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content;
}

function buildListing(
  files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>,
  cutBytes: number | undefined,
): ExecResult {
  const entries = [...files]
    .filter(([path]) => path.startsWith('/work/out/'))
    .map(([path, content]) => `${content.byteLength} ${path.slice('/work/out/'.length)}\0`);

  const text = entries.join('');
  const whole = toBytes(text);
  const kept = cutBytes === undefined ? text : text.slice(0, cutBytes);
  const bytes = toBytes(kept);

  return {
    code: 0,
    signal: null,
    stdout: { bytes, totalBytes: whole.byteLength, isCut: bytes.byteLength < whole.byteLength },
    stderr: buildOutput(''),
    durationMs: 1,
  };
}

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  const aborted = Promise.withResolvers<void>();

  if (signal?.aborted === true) {
    return;
  }

  signal?.addEventListener('abort', () => aborted.resolve(), { once: true });

  await aborted.promise;
}
