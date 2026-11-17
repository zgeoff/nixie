import type { Logger } from '@heynixie/logger';
import type { SandboxAdapter, SandboxRecorderOptions, ToolTargetResolver } from '@heynixie/sandbox';
import { buildSandboxRecorder, watchMemoryKills } from '@heynixie/sandbox';
import { withSandboxCounts } from '@heynixie/spend';
import type { SandboxAdapterOptions } from '../sandbox/create-sandbox-adapter';
import { createSandboxAdapter } from '../sandbox/create-sandbox-adapter';
import type { SandboxSettings } from '../sandbox/resolve-sandbox-settings';
import type { SpendInputs } from '../spend/create-spend-inputs';
import { getSandboxRootDir } from './get-sandbox-root-dir';

export interface SandboxAdapterPartInputs {
  readonly createSandboxAdapter?: (options: SandboxAdapterOptions) => SandboxAdapter;
  readonly sandbox: SandboxSettings;
  readonly spend: SpendInputs | null;
  readonly dataDir: string;
  readonly log: Logger;
  readonly recorder: SandboxRecorderOptions;
  readonly toolTarget: ToolTargetResolver;
}

export function startSandboxAdapterPart(inputs: SandboxAdapterPartInputs): SandboxAdapter {
  const create = inputs.createSandboxAdapter ?? createSandboxAdapter;

  const built = create({
    recorder: buildSandboxRecorder(inputs.recorder),
    toolTarget: inputs.toolTarget,
    sandbox: inputs.sandbox,
    testRootDir: getSandboxRootDir(inputs.dataDir),
    hostEnv: process.env,
    ...(inputs.spend === null ? {} : { modelGateway: { modelURL: inputs.spend.modelURL } }),
  });

  const watched = watchMemoryKills(built, { log: inputs.log });

  return inputs.spend === null
    ? watched
    : withSandboxCounts(watched, { gateway: inputs.spend.gateway, log: inputs.log });
}
