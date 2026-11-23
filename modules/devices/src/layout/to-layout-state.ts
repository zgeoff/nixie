import type { LayoutState, LayoutView } from '../types';

// The layout as the device stream carries it: the grid, and each region's content and end.
export function toLayoutState(layout: LayoutView | null): LayoutState {
  if (layout === null) {
    return { kind: 'layout', layout: null };
  }

  return {
    kind: 'layout',
    layout: {
      columns: [...layout.columns],
      rows: [...layout.rows],
      regions: layout.regions.map((region) => {
        const untilMs = region.shown?.untilMs ?? null;

        return {
          name: region.name,
          column: region.column,
          row: region.row,
          columnSpan: region.columnSpan,
          rowSpan: region.rowSpan,
          content: region.shown?.content ?? null,
          until: untilMs === null ? null : new Date(untilMs).toISOString(),
        };
      }),
    },
  };
}
