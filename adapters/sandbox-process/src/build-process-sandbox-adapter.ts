import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
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

export interface ProcessSandboxOptions {
  readonly recorder: SandboxRecorder;

  // each sandbox gets a directory of its own here
  readonly rootDir: string;
  readonly toolTarget: ToolTargetResolver;
  readonly killGraceMs?: number;
}

// The sandbox double for a test build: each guest runs as a local child process with no isolation,
// and reaches nixie's tools over a loopback relay. It records and refuses as a real adapter does,
// but enforces no egress and injects no grant, passing each grant's placeholders alone.
export function buildProcessSandboxAdapter(options: ProcessSandboxOptions): SandboxAdapter {
  const live = new Map<string, ProcessState>();
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
      id,
      spec,
      fsRoot: join(options.rootDir, id, 'fs'),
      state,
      remove: () => removeSandbox(id),
    });
  };

  return {
    id: 'process',
    boundary: 'process',
    create: (spec) => createProcessSandbox(options, spec, { getSandbox, removeSandbox }),
    get: async (id) => {
      const row = await options.recorder.findRow('process', id);

      return row ? getSandbox(row.sandboxID, row.spec) : null;
    },
    list: async (owner) => {
      const rows = await options.recorder.list('process', owner);

      return rows.map((row) => getSandbox(row.sandboxID, row.spec));
    },
  };
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

async function setupProcessSandbox(
  options: ProcessSandboxOptions,
  sandbox: Sandbox,
): Promise<Sandbox> {
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
    // oxlint-disable-next-line no-await-in-loop -- one record per grant, in order
    await recorder.write({
      event: 'granted',
      sandboxID: id,
      secret: grant.secret,
      host: grant.host,
    });
  }
}
