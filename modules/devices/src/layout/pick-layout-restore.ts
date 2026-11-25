export interface SavedRegionState {
  readonly region: string;
  readonly shownSequence: number;

  // whether the saved content record still shows its content, which a forget, a lapse of its
  // minutes or a removed image ends
  readonly isShown: boolean;
}

export interface FoundSavedLayout<Grid> {
  readonly grid: Grid;
  readonly states: readonly SavedRegionState[];
}

export interface LayoutRestoreInput<Grid> {
  // every name the device saved a layout under
  readonly names: readonly string[];

  // the layout under the asked name, or null when no layout has it
  readonly found: FoundSavedLayout<Grid> | null;
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
  input: LayoutRestoreInput<Grid>,
): LayoutRestorePlan<Grid> {
  if (input.found === null) {
    return { status: 'unknown', names: input.names };
  }

  const regions = input.found.grid.regions.map((region) => region.name);
  const inGrid = input.found.states.filter((state) => regions.includes(state.region));

  return {
    status: 'restore',
    grid: input.found.grid,
    regions,
    kept: inGrid
      .filter((state) => state.isShown)
      .map((state) => ({ region: state.region, shownSequence: state.shownSequence })),
    emptied: inGrid.filter((state) => !state.isShown).map((state) => state.region),
  };
}
