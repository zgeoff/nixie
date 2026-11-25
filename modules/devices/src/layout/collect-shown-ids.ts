import type { LayoutView } from '../types';

// the short ID of the content each region shows now, by the region's name
export function collectShownIDs(layout: LayoutView | null): ReadonlyMap<string, string> {
  return new Map(
    (layout?.regions ?? []).flatMap((region) =>
      region.shown === null ? [] : [[region.name, region.shown.shownID] as const],
    ),
  );
}
