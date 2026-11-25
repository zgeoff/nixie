import type { LayoutView } from '../types';

export interface LayoutSaveInput {
  readonly layout: LayoutView | null;

  // the sequence of the layout record the device row points at, or null for none
  readonly layoutSequence: number | null;
  readonly isNameTaken: boolean;
}

export type LayoutSavePlan =
  | { readonly status: 'none' }
  | {
      readonly status: 'save';
      readonly isReplaced: boolean;
      readonly layoutSequence: number;
      readonly regions: readonly { readonly region: string; readonly shownSequence: number }[];
    };

// What a save stores: the layout record, and the record each region shows at this time. A region
// that shows an earlier record because a newer one's minutes ran out is saved with the earlier one,
// and a blank region is saved with none.
export function pickLayoutSave(input: LayoutSaveInput): LayoutSavePlan {
  if (input.layout === null || input.layoutSequence === null) {
    return { status: 'none' };
  }

  return {
    status: 'save',
    isReplaced: input.isNameTaken,
    layoutSequence: input.layoutSequence,
    regions: input.layout.regions.flatMap((region) =>
      region.shown === null ? [] : [{ region: region.name, shownSequence: region.shown.sequence }],
    ),
  };
}
