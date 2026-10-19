import { countTextTokens } from '@heynixie/compaction';
import type { Definitions, Log } from '@heynixie/log';
import type { ToolTargetResolver } from '@heynixie/sandbox';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import type { StubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import { buildStubGuestSandboxes } from '@heynixie/sandbox/test-utils';
import type { TestSandboxes } from './build-retirable-sandboxes';
import { buildRetirableSandboxes } from './build-retirable-sandboxes';
import { sendTestToolCall } from './send-test-tool-call';

export interface TestFakeSandboxesOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // where each run's tool endpoint listens, which the fake guest calls its tools on
  readonly toolTarget: ToolTargetResolver;
}

export interface TestFakeSandboxes extends TestSandboxes {
  // the fake guest behind the sandboxes: its replies, its sessions and every frame it received
  readonly guest: StubGuestSandboxes;
}

// The stateful fake conversation guest in place of the process double, wrapped so a test can retire
// an owner's sandboxes. Its guests call a tool through the run's real endpoint.
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
