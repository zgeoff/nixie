import { expect, onTestFinished, test } from 'bun:test';
import { buildSandboxSpec, sandboxSizes } from '@heynixie/sandbox';
import { buildImpPort, buildImpSandboxAdapter, parseImpConfig } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';

// These tests need a real impd on a host with /dev/kvm and the codex image built into it.
// docs/runbooks/imp-isolation-tests.md names the variables that turn them on. The codex turn
// gates are in integration/codex-gates.imp.test.ts.
const hasImpHost =
  process.env['NIXIE_IMP_TEST_URL'] !== undefined &&
  process.env['NIXIE_IMP_TEST_TOKEN'] !== undefined &&
  (process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '') !== '';

test.skipIf(!hasImpHost)('it runs the pinned CLI in a codex sandbox on an imp host', async () => {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const testRecorder = await setupTestRecorder();

  const config = parseImpConfig({
    IMP_URL: process.env['NIXIE_IMP_TEST_URL'],
    IMP_TOKEN: process.env['NIXIE_IMP_TEST_TOKEN'],
    IMP_HOST_ADDRESSES: process.env['NIXIE_IMP_TEST_HOST_ADDRESSES'],
    IMP_EGRESS_DENY: process.env['NIXIE_IMP_TEST_EGRESS_DENY'],
  });

  const adapter = buildImpSandboxAdapter({
    port: buildImpPort(config),
    recorder: testRecorder.recorder,
    config,
    toolTarget: () => ({ path: '/nonexistent/tools.sock' }),
  });

  const sandbox = await adapter.create(
    buildSandboxSpec({
      kind: 'worker',
      image: process.env['NIXIE_IMP_TEST_CODEX_IMAGE'] ?? '',
      owner: 'codex_turn_check',
      limits: sandboxSizes.codexTask,
    }),
  );

  stack.defer(() => sandbox.destroy());

  const result = await sandbox.exec({ argv: ['codex', '--version'], env: {} });

  expect(new TextDecoder().decode(result.stdout.bytes).trim()).toBe('codex-cli 0.166.0');
});
