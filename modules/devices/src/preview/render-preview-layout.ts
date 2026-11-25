import type { RenderFile } from '@heynixie/wire';
import type { LayoutView } from '../types';
import { pickTextColour } from './pick-text-colour';
import { renderPreviewRegion } from './render-preview-region';
import type { PreviewPageInput } from './types';

// The markup of the device page's grid, with each region's background and content.
export function renderPreviewLayout(
  layout: LayoutView,
  input: PreviewPageInput,
  pages: ReadonlyMap<string, RenderFile>,
): string {
  const columns = layout.columns.map(toTrack).join(' ');
  const rows = layout.rows.map(toTrack).join(' ');

  const cells = layout.regions.map((region) => {
    const colours =
      region.background === null
        ? ''
        : `background-color:${Bun.escapeHTML(region.background)};color:${pickTextColour(region.background)};`;

    const place = `grid-column:${region.column} / span ${region.columnSpan};grid-row:${region.row} / span ${region.rowSpan};`;

    const content =
      region.shown === null
        ? ''
        : renderPreviewRegion(region.shown.content, {
            images: input.images,
            pagePath: pages.get(region.name)?.path ?? null,
            nowMs: input.nowMs,
            timeZone: input.timeZone,
          });

    return `<div class="cell" data-region="${Bun.escapeHTML(region.name)}" style="${place}${colours}">${content}</div>`;
  });

  return `<div class="grid" style="grid-template-columns:${columns};grid-template-rows:${rows}">${cells.join('')}</div>`;
}

// `2fr` as `minmax(0, 2fr)`, so a wide region never pushes the others out of the grid
function toTrack(track: string): string {
  return `minmax(0, ${track})`;
}
