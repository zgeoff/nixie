import type { RenderFile } from '@heynixie/wire';

// The markup of the page in the files that the preview sends to the render sandbox.
export function readPreviewPage(files: readonly RenderFile[]): string {
  const page = files.find((file) => file.path === 'index.html');

  return Buffer.from(page?.base64 ?? '', 'base64').toString('utf8');
}
