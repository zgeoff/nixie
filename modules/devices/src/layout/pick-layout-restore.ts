export interface SavedRegionState {
  readonly region: string;
  readonly shownSequence: number;

  // whether the region shows content when the restore reads it
  readonly isShown: boolean;
}

export interface LayoutRestorePlan {
  // the saved regions that come back with their content
  readonly kept: readonly { readonly region: string; readonly shownSequence: number }[];

  // the regions that come back blank, because their content is gone
  readonly emptied: readonly string[];
}

// Which saved regions a restore points back at their content. A region that the saved grid does not
// hold is dropped, and one that shows nothing now comes back blank and is named.
export function pickLayoutRestore(
  gridRegionNames: readonly string[],
  saved: readonly SavedRegionState[],
): LayoutRestorePlan {
  const inGrid = saved.filter((region) => gridRegionNames.includes(region.region));

  return {
    kept: inGrid
      .filter((region) => region.isShown)
      .map((region) => ({ region: region.region, shownSequence: region.shownSequence })),
    emptied: inGrid.filter((region) => !region.isShown).map((region) => region.region),
  };
}
