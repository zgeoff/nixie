import type { Definitions, Log } from '@heynixie/log';
import type { ToolTargetResolver } from '@heynixie/sandbox';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import { createSandboxAdapter } from '../create-sandbox-adapter';
import type { TestSandboxes } from './build-retirable-sandboxes';
import { buildRetirableSandboxes } from './build-retirable-sandboxes';

export interface TestSandboxesOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly toolTarget: ToolTargetResolver;

  readonly rootDir: string;
}

export function createTestSandboxes(options: TestSandboxesOptions): TestSandboxes {
  const adapter = createSandboxAdapter({
    recorder: buildSandboxRecorder({ log: options.log, definitions: options.definitions }),
    toolTarget: options.toolTarget,
    sandbox: { adapter: 'test' },
    testRootDir: options.rootDir,
    hostEnv: {},
  });

  return buildRetirableSandboxes(adapter);
}
