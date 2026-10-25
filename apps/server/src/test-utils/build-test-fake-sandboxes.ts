import { countTextTokens } from '@heynixie/compaction';
import type { Definitions, Log } from '@heynixie/log';
import type { ToolTargetResolver } from '@heynixie/sandbox';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import { buildStubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import { sendTestToolCall } from '@heynixie/tools/test-utils';
import type { TestSandboxes } from './build-retirable-sandboxes';
import { buildRetirableSandboxes } from './build-retirable-sandboxes';

export interface TestFakeSandboxesOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;

  readonly toolTarget: ToolTargetResolver;
}

export interface TestFakeSandboxes extends TestSandboxes {
  readonly guest: StubGuestSandboxes;
}

export function buildTestFakeSandboxes(options: TestFakeSandboxesOptions): TestFakeSandboxes {
  const guest = buildStubGuestSandboxes({
    recorder: buildSandboxRecorder({ log: options.log, definitions: options.definitions }),
    callTool: (call) =>
      sendTestToolCall({
        target: options.toolTarget({ id: call.sandboxID, owner: call.owner }),
        token: call.token,
        name: call.name,
        input: call.input,
      }),
    countTokens: countTextTokens,
  });

  return { ...buildRetirableSandboxes(guest.adapter), guest };
}
