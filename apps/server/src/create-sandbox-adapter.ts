import type { SandboxAdapter, SandboxRecorder, ToolTargetResolver } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter } from '@heynixie/sandbox-imp';
import { createProcessSandboxAdapter } from '@heynixie/sandbox-process';
import type { SandboxSettings } from './resolve-sandbox-settings';

export interface SandboxAdapterOptions {
  readonly recorder: SandboxRecorder;
  readonly toolTarget: ToolTargetResolver;

  // the adapter the configuration selects, with impd's section and token for imp
  readonly sandbox: SandboxSettings;

  // where the test sandbox keeps each sandbox's directory
  readonly testRootDir: string;

  // nixie's own environment, whose credential broker variables the test sandbox passes to a guest
  // with a grant
  readonly hostEnv: Readonly<Record<string, string | undefined>>;
}

// Creates the sandbox adapter the configuration selects: imp, or the test sandbox, the process
// double that is no security boundary. The release bundle holds no part of the double, and the
// configuration's schema refuses the test sandbox in a release.
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
