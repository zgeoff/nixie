import type { SandboxAdapter, SandboxRecorder, ToolTargetResolver } from '@heynixie/sandbox';
import { createProcessSandboxAdapter } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter } from '@heynixie/sandbox-imp';
import type { SandboxSettings } from './resolve-sandbox-settings';

export interface SandboxAdapterOptions {
  readonly recorder: SandboxRecorder;
  readonly toolTarget: ToolTargetResolver;

  readonly sandbox: SandboxSettings;

  readonly testRootDir: string;

  readonly hostEnv: Readonly<Record<string, string | undefined>>;
}

export function createSandboxAdapter(options: SandboxAdapterOptions): SandboxAdapter {
  if (options.sandbox.adapter === 'test') {
    if (NIXIE_TEST_BUILD) {
      return createProcessSandboxAdapter({
        recorder: options.recorder,
        rootDir: options.testRootDir,
        toolTarget: options.toolTarget,
        hostEnv: options.hostEnv,
      });
    }

    throw new Error('a release build holds no test sandbox');
  }

  return buildImpSandboxAdapter({
    port: buildImpPort({ url: options.sandbox.imp.url, token: options.sandbox.imp.token }),
    recorder: options.recorder,
    config: { publicEgress: options.sandbox.imp.publicEgress },
    toolTarget: options.toolTarget,
  });
}
