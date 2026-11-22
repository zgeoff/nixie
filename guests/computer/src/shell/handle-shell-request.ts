import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { resolveFilesPath } from './resolve-files-path';
import { runShellCommand } from './run-shell-command';
import type { TerminalAccount } from './terminal-account';

export interface ShellContext {
  // the folder `~/files` names
  readonly root: string;
  readonly env: Readonly<Record<string, string>>;

  // the account the files are read and written as, so a link planted in the files folder never
  // reaches more than the terminal's user can
  readonly account: TerminalAccount;

  // true once, on the first request that reaches a disk the guest started on empty
  readonly takeIsDiskNew: () => Promise<boolean>;
}

export async function handleShellRequest(
  context: ShellContext,
  request: ComputerRequest,
): Promise<ComputerReply> {
  const isDiskNew = await context.takeIsDiskNew();

  if (request.op === 'run') {
    return runShellCommand({
      argv: request.argv,
      timeoutSeconds: request.timeoutSeconds,
      cwd: context.root,
      env: context.env,
      isDiskNew,
    });
  }

  if (request.op === 'readFile') {
    return readFilesFile(context, request.path, isDiskNew);
  }

  if (request.op === 'writeFile') {
    return writeFilesFile(context, request, isDiskNew);
  }

  return {
    kind: 'failed',
    ok: false,
    reason: 'failed',
    message: 'the shell has no such operation',
  };
}

const fileLimitBytes = 25 * 1024 * 1024;

async function readFilesFile(
  context: ShellContext,
  path: string,
  isDiskNew: boolean,
): Promise<ComputerReply> {
  const resolved = await resolveFilesPath(context.root, path);

  if (resolved === null) {
    return { kind: 'failed', ok: false, reason: 'bad_path' };
  }

  const info = await stat(resolved).catch(() => null);

  if (info === null || !info.isFile()) {
    return { kind: 'failed', ok: false, reason: 'no_file' };
  }

  if (info.size > fileLimitBytes) {
    return { kind: 'failed', ok: false, reason: 'too_big' };
  }

  const readArgv = context.account.wrap(['head', '-c', String(fileLimitBytes + 1), '--', resolved]);

  const read = Bun.spawn(readArgv, {
    env: context.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });

  const content = await new Response(read.stdout).arrayBuffer();

  const bytes = Buffer.from(content);

  if ((await read.exited) !== 0) {
    return { kind: 'failed', ok: false, reason: 'no_file' };
  }

  if (bytes.byteLength > fileLimitBytes) {
    return { kind: 'failed', ok: false, reason: 'too_big' };
  }

  return {
    kind: 'file',
    ok: true,
    name: basename(resolved),
    base64: bytes.toString('base64'),
    isDiskNew,
  };
}

async function writeFilesFile(
  context: ShellContext,
  request: Extract<ComputerRequest, { op: 'writeFile' }>,
  isDiskNew: boolean,
): Promise<ComputerReply> {
  const resolved = await resolveFilesPath(context.root, request.path);

  if (resolved === null || resolved === context.root) {
    return { kind: 'failed', ok: false, reason: 'bad_path' };
  }

  const bytes = Buffer.from(request.base64, 'base64');

  if (bytes.byteLength > fileLimitBytes) {
    return { kind: 'failed', ok: false, reason: 'too_big' };
  }

  const write = Bun.spawn(
    context.account.wrap(['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat > "$1"', 'sh', resolved]),
    { env: context.env, stdin: bytes, stdout: 'ignore', stderr: 'pipe' },
  );

  const [stderr, exitCode] = await Promise.all([new Response(write.stderr).text(), write.exited]);

  if (exitCode !== 0) {
    const isFull = stderr.includes('No space left');

    return { kind: 'failed', ok: false, reason: isFull ? 'disk_full' : 'failed' };
  }

  return { kind: 'written', ok: true, path: request.path, bytes: bytes.byteLength, isDiskNew };
}
