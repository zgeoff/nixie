import type { ScreenContent } from '@heynixie/contract';
import type { RenderFile } from '@heynixie/wire';
import { renderEntryPath } from '@heynixie/wire';
import { match } from 'ts-pattern';
import type { LayoutView } from '../types';
import { pickTextColour } from './pick-text-colour';
import { previewFitScript } from './preview-fit-script';
import { renderPreviewImage } from './render-preview-image';
import { renderPreviewMarkdown } from './render-preview-markdown';
import { renderPreviewRegion } from './render-preview-region';
import type { PreviewPageInput } from './types';

const previewStyle = `
* { box-sizing: border-box; }
html, body { margin: 0; background: black; color: white; font-family: system-ui, sans-serif; }
.grid { display: grid; width: 100vw; height: 100vh; overflow: hidden; }
.cell { min-width: 0; min-height: 0; overflow: hidden; position: relative; }
.box { width: 100%; height: 100%; overflow: hidden; }
.box > * { width: 100%; }
.centred { display: flex; align-items: center; }
.oneline { text-align: center; white-space: nowrap; }
.live { font-variant-numeric: tabular-nums; }
.label { font-size: 0.4em; opacity: 0.7; }
.pad { padding: 0.25em; }
.reply { overflow-wrap: anywhere; }
.reply > * { margin: 0 0 0.5em; }
.reply ul { list-style: disc; padding-inline-start: 1.5em; }
.reply ol { list-style: decimal; padding-inline-start: 1.5em; }
.reply code, .reply pre { font-family: ui-monospace, monospace; }
.reply pre { overflow-x: auto; padding: 0.5em; border: 1px solid; }
.reply h1, .reply h2, .reply h3, .reply h4 { font-weight: 600; }
.reply table { border-collapse: collapse; }
.reply td, .reply th { border: 1px solid; padding-inline: 0.5em; }
img { width: 100%; height: 100%; }
img.whole { object-fit: contain; }
img.fill { object-fit: cover; object-position: center; }
.screen { display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden; }
.screen-text { font-size: 1.5rem; padding: 1.5rem; }
.screen-picture { flex: 1; min-height: 0; }
`;

// The page that the render sandbox opens: the device page's grid with each region's content, or the
// blocks of a show or an idle scene, and the files it names. It holds no network request but those
// for its own files, and the sandbox refuses every other.
export function buildPreviewPage(input: PreviewPageInput): RenderFile[] {
  const body = match(input.surface)
    .with({ kind: 'layout' }, (surface) => renderLayout(surface.layout, input))
    .with({ kind: 'blocks' }, (surface) => renderBlocks(surface.blocks, input))
    .exhaustive();

  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
    "script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'\">" +
    `<style>${previewStyle}</style></head><body>${body}<script>${previewFitScript}</script></body></html>`;

  return [
    {
      path: renderEntryPath,
      mediaType: 'text/html',
      base64: Buffer.from(html).toString('base64'),
    },
    ...input.images.values(),
  ];
}

function renderLayout(layout: LayoutView, input: PreviewPageInput): string {
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

function renderBlocks(blocks: readonly ScreenContent[], input: PreviewPageInput): string {
  const rendered = blocks.map((block) =>
    block.kind === 'markdown'
      ? `<div class="screen-text reply">${renderPreviewMarkdown(block.text)}</div>`
      : `<div class="screen-picture">${renderPreviewImage(block.image, block.fit, input.images)}</div>`,
  );

  return `<div class="screen">${rendered.join('')}</div>`;
}
