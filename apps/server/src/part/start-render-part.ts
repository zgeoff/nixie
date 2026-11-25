import { join } from 'node:path';
import type { RenderSandbox } from '@heynixie/connectors';
import { startRenderSandbox } from '@heynixie/connectors';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox, sandboxSizes } from '@heynixie/sandbox';
import { getSandboxImage } from '../sandbox/get-sandbox-image';
import type { ServerPartsOptions } from '../server/start-server';

export interface RenderPartInputs {
  readonly options: Pick<ServerPartsOptions, 'images' | 'cleanup'>;
  readonly adapter: SandboxAdapter;
}

const renderImageArgv: readonly string[] = ['/usr/local/bin/bun', '/app/render.js'];

const testRenderArgv: readonly string[] = [
  process.execPath,
  join(import.meta.dir, '../../../../guests/render/src/test-main.ts'),
];

// The render sandbox of the device preview: one new sandbox for each render, with no network. A
// deployment whose sandbox manifest holds no render image gets none, and its previews draw nothing.
export async function startRenderPart(inputs: RenderPartInputs): Promise<RenderSandbox | null> {
  if (inputs.options.images.render === undefined) {
    return null;
  }

  const render = startRenderSandbox({
    adapter: inputs.adapter,
    image: getSandboxImage(inputs.options.images, 'render').name,
    argv: isTestSandbox(inputs.adapter) ? testRenderArgv : renderImageArgv,
    sandboxLimits: sandboxSizes.render,
  });

  await inputs.options.cleanup.defer(() => render.stop());

  return render;
}
