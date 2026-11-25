import { onTestFinished } from 'bun:test';
import type { RenderSandbox, RenderSandboxOptions } from '../render/start-render-sandbox';
import { startRenderSandbox } from '../render/start-render-sandbox';
import type { StubGuest, StubSandboxAdapterOptions } from './build-stub-sandbox-adapter';
import { buildStubSandboxAdapter } from './build-stub-sandbox-adapter';

export interface TestRenderSandboxOptions {
  readonly adapter?: StubSandboxAdapterOptions;
  readonly render?: Partial<RenderSandboxOptions>;
}

// Starts a render sandbox over a stub adapter whose guest the test names, and stops it when the
// test ends.
export function startTestRenderSandbox(guest: StubGuest, options: TestRenderSandboxOptions = {}) {
  const adapter = buildStubSandboxAdapter(guest, options.adapter);

  const sandbox: RenderSandbox = startRenderSandbox({
    adapter,
    image: 'nixie-render',
    argv: ['bun', '/app/render.js'],
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 1024 },
    ...options.render,
  });

  onTestFinished(() => sandbox.stop());

  return { adapter, sandbox };
}
