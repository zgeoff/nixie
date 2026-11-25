import type { LayoutView } from '../types';

// The IDs of the images that the pages of a layout declare, which a preview draws. A device never
// reads them as images of its own: a page's frame loads each by its own ticket.
export function collectPageImages(layout: LayoutView | null): readonly string[] {
  return (layout?.regions ?? []).flatMap((region) =>
    region.shown?.content.kind === 'html' ? (region.shown.content.images ?? []) : [],
  );
}
