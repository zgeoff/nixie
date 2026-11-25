import type { RenderFile } from '@heynixie/wire';

// The markup of an image, which draws nothing when it has no file because a forget removed it.
export function renderPreviewImage(
  image: string,
  fit: 'whole' | 'fill',
  images: ReadonlyMap<string, RenderFile>,
): string {
  const file = images.get(image);

  return file === undefined ? '' : `<img class="${fit}" alt="" src="${Bun.escapeHTML(file.path)}">`;
}
