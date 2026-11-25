import type { ScreenContent } from '@heynixie/contract';
import { renderPreviewImage } from './render-preview-image';
import { renderPreviewMarkdown } from './render-preview-markdown';
import type { PreviewPageInput } from './types';

// The markup of the blocks of a show or of an idle scene, one under the other.
export function renderPreviewBlocks(
  blocks: readonly ScreenContent[],
  input: PreviewPageInput,
): string {
  const rendered = blocks.map((block) =>
    block.kind === 'markdown'
      ? `<div class="screen-text reply">${renderPreviewMarkdown(block.text)}</div>`
      : `<div class="screen-picture">${renderPreviewImage(block.image, block.fit, input.images)}</div>`,
  );

  return `<div class="screen">${rendered.join('')}</div>`;
}
