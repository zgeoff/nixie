import type { RegionEventContent } from '@heynixie/contract';
import type { IssuedTickets } from '../stream/create-page-tickets';
import type { LayoutState, LayoutView, ShownRegion } from '../types';

// The layout as the device stream carries it: the grid, and each region's content and end. A page
// travels as the tickets that its frame and images load by, given in `tickets` by region name, and
// a page with no tickets reads as a blank region.
export function toLayoutState(
  layout: LayoutView | null,
  tickets: ReadonlyMap<string, IssuedTickets> = new Map(),
): LayoutState {
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
          background: region.background,
          content: toEventContent(region.shown, tickets.get(region.name)),
          shown: region.shown?.shownID ?? null,
          until: untilMs === null ? null : new Date(untilMs).toISOString(),
        };
      }),
    },
  };
}

function toEventContent(
  shown: ShownRegion | null,
  tickets: IssuedTickets | undefined,
): RegionEventContent | null {
  if (shown === null) {
    return null;
  }

  if (shown.content.kind !== 'html') {
    return shown.content;
  }

  return tickets === undefined
    ? null
    : { kind: 'html', frame: tickets.frame, images: [...tickets.images] };
}
