export interface SavedRegionState {
  readonly region: string;
  readonly shownSequence: number;

  // whether the saved content record still shows its content, which a forget, a lapse of its
  // minutes or a removed image ends
  readonly isShown: boolean;
}

export interface SavedLayoutState<Grid> {
  readonly name: string;
  readonly grid: Grid;
  readonly states: readonly SavedRegionState[];
}

export type LayoutRestorePlan<Grid> =
  | { readonly status: 'unknown'; readonly names: readonly string[] }
  | {
      readonly status: 'restore';
      readonly grid: Grid;
      readonly regions: readonly string[];

      // the saved regions that come back with their content
      readonly kept: readonly { readonly region: string; readonly shownSequence: number }[];

      // the regions that come back blank, because their content is gone
      readonly emptied: readonly string[];
    };

// What a restore does: refuse a name that no saved layout has, and else point each saved region
// back at its content. A region that the saved grid does not hold is dropped, and one whose content
// no longer shows comes back blank and is named.
export function pickLayoutRestore<Grid extends { readonly regions: readonly { name: string }[] }>(
  layouts: readonly SavedLayoutState<Grid>[],
  name: string,
): LayoutRestorePlan<Grid> {
  const found = layouts.find((layout) => layout.name === name);

  if (found === undefined) {
    return { status: 'unknown', names: layouts.map((layout) => layout.name) };
  }

  const regions = found.grid.regions.map((region) => region.name);
  const inGrid = found.states.filter((state) => regions.includes(state.region));

  return {
    status: 'restore',
    grid: found.grid,
    regions,
    kept: inGrid
      .filter((state) => state.isShown)
      .map((state) => ({ region: state.region, shownSequence: state.shownSequence })),
    emptied: inGrid.filter((state) => !state.isShown).map((state) => state.region),
  };
}
