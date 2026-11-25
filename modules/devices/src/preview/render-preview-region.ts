import type { RegionContent } from '@heynixie/contract';
import type { RenderFile } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { formatPreviewClock } from './format-preview-clock';
import { formatPreviewCountdown } from './format-preview-countdown';
import { renderPreviewImage } from './render-preview-image';
import { renderPreviewMarkdown } from './render-preview-markdown';

export interface PreviewRegionContext {
  readonly images: ReadonlyMap<string, RenderFile>;

  // the file of the region's page, which a page region frames; null for any other region
  readonly pagePath: string | null;
  readonly nowMs: number;
  readonly timeZone: string;
}

// The markup of what one region shows. Each kind of content has its own branch, so a kind that a
// later change adds fails the type check until it has one.
export function renderPreviewRegion(content: RegionContent, context: PreviewRegionContext): string {
  return match(content)
    .with(
      { kind: 'markdown' },
      (markdown) =>
        `<div class="box" data-fit><div class="pad reply">${renderPreviewMarkdown(markdown.markdown)}</div></div>`,
    )
    .with({ kind: 'image' }, (image) => renderPreviewImage(image.image, image.fit, context.images))
    .with({ kind: 'html' }, () =>
      context.pagePath === null
        ? ''
        : `<iframe class="page" sandbox="allow-scripts" src="${Bun.escapeHTML(context.pagePath)}"></iframe>`,
    )
    .with(
      { kind: 'live', live: 'clock' },
      (clock) =>
        `<div class="box centred" data-fit><div class="oneline live">${Bun.escapeHTML(formatPreviewClock(context.nowMs, clock.format, context.timeZone))}</div></div>`,
    )
    .with({ kind: 'live', live: 'countdown' }, (countdown) => {
      const label =
        countdown.label === undefined
          ? ''
          : `<div class="label">${Bun.escapeHTML(countdown.label)}</div>`;

      const left = formatPreviewCountdown(Date.parse(countdown.to), context.nowMs);

      return `<div class="box centred" data-fit><div class="oneline live">${label}${left}</div></div>`;
    })
    .exhaustive();
}
