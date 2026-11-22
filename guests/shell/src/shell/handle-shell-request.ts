import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { resolveFilesPath } from './resolve-files-path';
import { runShellCommand } from './run-shell-command';

export interface ShellContext {
  // the folder `~/files` names
  readonly root: string;
  readonly env: Readonly<Record<string, string>>;

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
    return readFilesFile(context.root, request.path, isDiskNew);
  }

  if (request.op === 'writeFile') {
    return writeFilesFile(context.root, request, isDiskNew);
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
  root: string,
  path: string,
  isDiskNew: boolean,
): Promise<ComputerReply> {
  const resolved = await resolveFilesPath(root, path);

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

  const bytes = await readFile(resolved);

  return {
    kind: 'file',
    ok: true,
    name: basename(resolved),
    base64: bytes.toString('base64'),
    isDiskNew,
  };
}

async function writeFilesFile(
  root: string,
  request: Extract<ComputerRequest, { op: 'writeFile' }>,
  isDiskNew: boolean,
): Promise<ComputerReply> {
  const resolved = await resolveFilesPath(root, request.path);

  if (resolved === null || resolved === root) {
    return { kind: 'failed', ok: false, reason: 'bad_path' };
  }

  const bytes = Buffer.from(request.base64, 'base64');

  if (bytes.byteLength > fileLimitBytes) {
    return { kind: 'failed', ok: false, reason: 'too_big' };
  }

  try {
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, bytes);
  } catch (error) {
    const isFull = error instanceof Error && 'code' in error && error.code === 'ENOSPC';

    return { kind: 'failed', ok: false, reason: isFull ? 'disk_full' : 'failed' };
  }

  return { kind: 'written', ok: true, path: request.path, bytes: bytes.byteLength, isDiskNew };
}
