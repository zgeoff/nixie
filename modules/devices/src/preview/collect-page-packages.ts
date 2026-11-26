import type { LayoutView } from '../types';

// The specs of the packages that the pages of a layout name, which a preview loads from the files
// of the approved packages.
export function collectPagePackages(layout: LayoutView | null): readonly string[] {
  return (layout?.regions ?? []).flatMap((region) =>
    region.shown?.content.kind === 'html' ? (region.shown.content.packages ?? []) : [],
  );
}
