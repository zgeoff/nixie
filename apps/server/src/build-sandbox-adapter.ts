import type { SandboxAdapter, SandboxRecorder, ToolTargetResolver } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { buildProcessSandboxAdapter } from '@heynixie/sandbox-process';

export interface SandboxAdapterOptions {
  readonly recorder: SandboxRecorder;
  readonly toolTarget: ToolTargetResolver;
  readonly env: Readonly<Record<string, string | undefined>>;

  // where a test build's process double keeps each sandbox's directory
  readonly testRootDir: string;
}

// Builds the sandbox adapter: the process double in a test build, and imp otherwise. The release
// bundle defines NIXIE_TEST_BUILD as false, so it holds no part of the double.
export function buildSandboxAdapter(options: SandboxAdapterOptions): SandboxAdapter {
  if (NIXIE_TEST_BUILD) {
    return buildProcessSandboxAdapter({
      recorder: options.recorder,
      rootDir: options.testRootDir,
      toolTarget: options.toolTarget,
    });
  }
  const config = parseImpConfig(options.env);

  return buildImpSandboxAdapter({
    port: buildImpPort(config),
    recorder: options.recorder,
    config,
    toolTarget: options.toolTarget,
  });
}
