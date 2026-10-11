import type { SandboxAdapter, SandboxRecorder, ToolTargetResolver } from '@heynixie/sandbox';
import type { ImpSection } from '@heynixie/sandbox-imp';
import { buildImpPort, buildImpSandboxAdapter } from '@heynixie/sandbox-imp';
import { buildProcessSandboxAdapter } from '@heynixie/sandbox-process';

export interface SandboxAdapterOptions {
  readonly recorder: SandboxRecorder;
  readonly toolTarget: ToolTargetResolver;

  // impd's URL and public egress ranges from the configuration, and its token from the secrets
  readonly imp: ImpSection & { readonly token: string };

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
  return buildImpSandboxAdapter({
    port: buildImpPort({ url: options.imp.url, token: options.imp.token }),
    recorder: options.recorder,
    config: { publicEgress: options.imp.publicEgress },
    toolTarget: options.toolTarget,
  });
}
