import type { RenderRequest } from '../render/render-request';

export interface MockRenderRequestOverrides {
  // the script of the page, which sets `window.__nixieReady` when the page is ready
  readonly script?: string;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
}

// A request for a page that holds one script and tells the render it is ready as soon as the
// script ends, unless the script says otherwise.
export function buildMockRenderRequest(overrides: MockRenderRequestOverrides = {}): RenderRequest {
  const script = overrides.script ?? 'window.__nixieReady = true;';
  const html = `<!doctype html><body style="margin:0;background:#123456"><script>${script}</script></body>`;

  return {
    width: overrides.width ?? 100,
    height: overrides.height ?? 100,
    pixelRatio: overrides.pixelRatio ?? 1,
    files: [
      { path: 'index.html', mediaType: 'text/html', base64: Buffer.from(html).toString('base64') },
    ],
  };
}
