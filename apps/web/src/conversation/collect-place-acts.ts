import type { PlaceActActivity } from './build-activity';
import type { LiveRecord } from './use-live-records';

// One entry per place, in the order the first call reached it, with a count for each tool. A record
// whose place a forget took shows nothing.
export function collectPlaceActs(records: readonly LiveRecord[]): readonly PlaceActActivity[] {
  const places = new Map<string, Map<string, number>>();

  for (const record of records) {
    const acted = record.placeActed;

    if (acted !== undefined) {
      const tools = places.get(acted.place) ?? new Map<string, number>();

      tools.set(acted.tool, (tools.get(acted.tool) ?? 0) + 1);
      places.set(acted.place, tools);
    }
  }

  return [...places].map(([place, tools]) => ({
    place,
    tools: [...tools].map(([tool, count]) => ({ tool, count })),
  }));
}
