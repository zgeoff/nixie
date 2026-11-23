import type { LayoutView } from '../types';

// The IDs of the images the regions of a layout show now, which a device may read even while a show
// covers the layout.
export function collectLayoutImages(layout: LayoutView | null): readonly string[] {
  return (layout?.regions ?? []).flatMap((region) =>
    region.shown?.content.kind === 'image' ? [region.shown.content.image] : [],
  );
}
