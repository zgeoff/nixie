import type { RenderFile } from '@heynixie/wire';
import { renderEntryPath } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { previewFitScript } from './preview-fit-script';
import { renderPreviewBlocks } from './render-preview-blocks';
import { renderPreviewLayout } from './render-preview-layout';
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
    .with({ kind: 'layout' }, (surface) => renderPreviewLayout(surface.layout, input))
    .with({ kind: 'blocks' }, (surface) => renderPreviewBlocks(surface.blocks, input))
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
