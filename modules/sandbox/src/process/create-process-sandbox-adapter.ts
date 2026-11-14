import { mkdirSync, realpathSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createSandboxID } from '../sandbox/create-sandbox-id';
import type {
  Sandbox,
  SandboxAdapter,
  SandboxRecorder,
  SandboxRow,
  SandboxSpec,
  ToolTargetResolver,
} from '../types';
import { buildProcessSandbox } from './build-process-sandbox';
import type { ProcessState } from './build-process-state';
import { buildProcessState } from './build-process-state';
import { pickBrokerEnv } from './pick-broker-env';
import { requireSandboxSpec } from './require-sandbox-spec';
import { stopGraceMs } from './stop-grace-ms';

export interface ProcessSandboxOptions {
  readonly recorder: SandboxRecorder;

  readonly rootDir: string;
  readonly toolTarget: ToolTargetResolver;
  readonly killGraceMs?: number;

  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
}

// This sandbox is NOT a security boundary: a guest reads whatever nixie's user can read and reaches
// any network the host reaches.
export function createProcessSandboxAdapter(input: ProcessSandboxOptions): SandboxAdapter {
  const options = { ...input, rootDir: createRealRootDir(input.rootDir) };
  const aliasRootDir = resolve(input.rootDir);

  const live = new Map<string, ProcessState>();

  const brokerEnv = pickBrokerEnv(options.hostEnv ?? {});

  const removeSandbox = async (id: string): Promise<void> => {
    await live.get(id)?.stop();

    live.delete(id);

    await rm(join(options.rootDir, id), { recursive: true, force: true });
  };

  const getSandbox = (id: string, spec: SandboxSpec): Sandbox => {
    const state = live.get(id) ?? buildProcessState();

    live.set(id, state);

    return buildProcessSandbox({
      recorder: options.recorder,
      toolTarget: options.toolTarget,
      killGraceMs: options.killGraceMs ?? stopGraceMs,
      brokerEnv,
      id,
      spec,
      fsRoot: join(options.rootDir, id, 'fs'),
      aliasFsRoot: join(aliasRootDir, id, 'fs'),
      state,
      remove: () => removeSandbox(id),
    });
  };

  // A data directory replaced under a kept row, such as by a restore, takes the sandbox's folder
  // with it, as a host can lose an imp with no destroy from nixie.
  const readRowSandbox = async (row: SandboxRow): Promise<Sandbox | null> => {
    if (!(await probeDirectory(join(options.rootDir, row.sandboxID)))) {
      await live.get(row.sandboxID)?.stop();

      live.delete(row.sandboxID);

      await options.recorder.write({
        event: 'destroyed',
        sandboxID: row.sandboxID,
        reason: 'destroyed',
      });

      return null;
    }

    return getSandbox(row.sandboxID, row.spec);
  };

  return {
    id: 'process',
    create: (spec) => createProcessSandbox(options, spec, { getSandbox, removeSandbox }),
    read: async (id) => {
      const row = await options.recorder.readRow('process', id);

      return row ? readRowSandbox(row) : null;
    },
    list: async (owner) => {
      const rows = await options.recorder.list('process', owner);
      const sandboxes = await Promise.all(rows.map((row) => readRowSandbox(row)));

      return sandboxes.filter((sandbox) => sandbox !== null);
    },

    addSecret: () => Promise.resolve(),

    addImage: () => Promise.resolve(),

    checkRuntime: () => Promise.resolve({ isReady: true, reason: null }),
  };
}

function createRealRootDir(rootDir: string): string {
  mkdirSync(rootDir, { recursive: true });

  return realpathSync(rootDir);
}

async function probeDirectory(path: string): Promise<boolean> {
  const found = await stat(path).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  return found?.isDirectory() ?? false;
}

interface ProcessSandboxes {
  readonly getSandbox: (id: string, spec: SandboxSpec) => Sandbox;
  readonly removeSandbox: (id: string) => Promise<void>;
}

async function createProcessSandbox(
  options: ProcessSandboxOptions,
  spec: SandboxSpec,
  sandboxes: ProcessSandboxes,
): Promise<Sandbox> {
  requireSandboxSpec(spec);

  const id = createSandboxID();

  // A read finds the folder of every recorded sandbox, so the folder exists before the row.
  await mkdir(join(options.rootDir, id), { recursive: true });

  await options.recorder.write({ event: 'created', sandboxID: id, adapter: 'process', spec });

  try {
    return await setupProcessSandbox(options, sandboxes.getSandbox(id, spec));
  } catch (error) {
    await sandboxes.removeSandbox(id);
    await options.recorder.write({ event: 'destroyed', sandboxID: id, reason: 'create_failed' });

    throw error;
  }
}

// impd gives every built image a filesystem of this size and fails the create of a sandbox on a
// smaller disk.
const imageFilesystemMiB = 4096;

async function setupProcessSandbox(
  options: ProcessSandboxOptions,
  sandbox: Sandbox,
): Promise<Sandbox> {
  if (sandbox.spec.limits.diskMiB < imageFilesystemMiB) {
    throw new Error(
      `a disk of ${sandbox.spec.limits.diskMiB} MiB is smaller than the image's filesystem (${imageFilesystemMiB} MiB)`,
    );
  }

  await mkdir(join(options.rootDir, sandbox.id, 'fs'), { recursive: true });
  await writeGrantRecords(options.recorder, sandbox.id, sandbox.spec);

  await sandbox.toolRoute();

  return sandbox;
}

async function writeGrantRecords(
  recorder: SandboxRecorder,
  id: string,
  spec: SandboxSpec,
): Promise<void> {
  for (const grant of spec.grants) {
    await recorder.write({
      event: 'granted',
      sandboxID: id,
      secret: grant.secret,
      host: grant.host,
    });
  }
}
