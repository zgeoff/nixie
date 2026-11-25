interface SavedRegionState {
  readonly region: string;
  readonly shownSequence: number;

  // whether the saved content record still shows its content, which a forget, a lapse of its
  // minutes or a removed image ends
  readonly isShown: boolean;
}

export interface SavedLayoutState<Grid> {
  readonly grid: Grid;
  readonly states: readonly SavedRegionState[];
}

export interface LayoutRestorePlan<Grid> {
  readonly grid: Grid;
  readonly regions: readonly string[];

  // the saved regions that come back with their content
  readonly kept: readonly { readonly region: string; readonly shownSequence: number }[];

  // the regions that come back blank, because their content is gone
  readonly emptied: readonly string[];
}

// What a restore of a saved layout does: point each saved region back at its content. A region that
// the saved grid does not hold is dropped, and one whose content no longer shows comes back blank
// and is named.
export function pickLayoutRestore<Grid extends { readonly regions: readonly { name: string }[] }>(
  saved: SavedLayoutState<Grid>,
): LayoutRestorePlan<Grid> {
  const regions = saved.grid.regions.map((region) => region.name);
  const inGrid = saved.states.filter((state) => regions.includes(state.region));

  return {
    grid: saved.grid,
    regions,
    kept: inGrid
      .filter((state) => state.isShown)
      .map((state) => ({ region: state.region, shownSequence: state.shownSequence })),
    emptied: inGrid.filter((state) => !state.isShown).map((state) => state.region),
  };
}
