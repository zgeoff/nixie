import { mkdirSync, realpathSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  Sandbox,
  SandboxAdapter,
  SandboxRecorder,
  SandboxSpec,
  ToolTargetResolver,
} from '@heynixie/sandbox';
import { createSandboxID, requireSandboxSpec, stopGraceMs } from '@heynixie/sandbox';
import { buildProcessSandbox } from './build-process-sandbox';
import type { ProcessState } from './build-process-state';
import { buildProcessState } from './build-process-state';
import { pickBrokerEnv } from './pick-broker-env';

export interface ProcessSandboxOptions {
  readonly recorder: SandboxRecorder;

  // each sandbox gets a directory of its own here
  readonly rootDir: string;
  readonly toolTarget: ToolTargetResolver;
  readonly killGraceMs?: number;

  // the host's environment, whose credential broker variables a guest with a grant gets, so the
  // host's broker injects the credential that the guest holds a placeholder for
  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
}

// The test sandbox, a test-build double that runs each guest as a local process. It is NOT a
// security boundary: a guest reads whatever nixie's user can and reaches any network the host does.
// It records and refuses as imp does, but passes each grant's placeholders instead of injecting it.
export function createProcessSandboxAdapter(input: ProcessSandboxOptions): SandboxAdapter {
  // the root through its symlinks, resolved once, so a guest's home is the path its processes see
  const options = { ...input, rootDir: createRealRootDir(input.rootDir) };

  // the root as configured, which a command's HOME may name instead of the real path
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

  return {
    id: 'process',
    boundary: 'process',
    create: (spec) => createProcessSandbox(options, spec, { getSandbox, removeSandbox }),
    read: async (id) => {
      const row = await options.recorder.readRow('process', id);

      return row ? getSandbox(row.sandboxID, row.spec) : null;
    },
    list: async (owner) => {
      const rows = await options.recorder.list('process', owner);

      return rows.map((row) => getSandbox(row.sandboxID, row.spec));
    },

    // the double injects no grant, so it holds no secret
    addSecret: () => Promise.resolve(),

    // the double runs each guest from the workspace, so it pulls no image
    addImage: () => Promise.resolve(),

    // the double's runtime is this process, which answers while it runs
    checkRuntime: () => Promise.resolve({ isReady: true, reason: null }),
  };
}

function createRealRootDir(rootDir: string): string {
  mkdirSync(rootDir, { recursive: true });

  return realpathSync(rootDir);
}

interface ProcessSandboxes {
  readonly getSandbox: (id: string, spec: SandboxSpec) => Sandbox;
  readonly removeSandbox: (id: string) => Promise<void>;
}

// Writes the created record before it makes anything, so recovery finds a sandbox that a crash
// cut short. A failure removes what it made and records the sandbox as destroyed.
async function createProcessSandbox(
  options: ProcessSandboxOptions,
  spec: SandboxSpec,
  sandboxes: ProcessSandboxes,
): Promise<Sandbox> {
  requireSandboxSpec(spec);

  const id = createSandboxID();

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
// smaller disk, so the double fails it too.
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
