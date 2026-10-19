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

  // the folder that holds each sandbox of the process double
  readonly rootDir: string;
}

// The test build's process double, which creates its root folder, wrapped so a test can retire an
// owner's sandboxes, which the owner then replaces. Everything else reaches the double unchanged.
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
