import type { LayoutGeometry, LayoutRegion } from '../types';

export interface LayoutInput {
  readonly columns?: readonly string[] | undefined;
  readonly rows?: readonly string[] | undefined;
  readonly regions?:
    | readonly {
        readonly name: string;
        readonly column: number;
        readonly row: number;
        readonly columnSpan?: number | undefined;
        readonly rowSpan?: number | undefined;
      }[]
    | undefined;
}

export type ParsedLayout =
  | { readonly status: 'ok'; readonly layout: LayoutGeometry }
  | { readonly status: 'bad'; readonly reason: string };

// The grid of a layout call, or the first reason it is bad: a track that is not a whole number of
// fr from 1 to 12, too many tracks or regions, a bad or repeated name, or a region that leaves the
// grid or overlaps another.
export function parseLayout(input: LayoutInput): ParsedLayout {
  const columns = input.columns ?? [];
  const rows = input.rows ?? [];
  const regions = input.regions ?? [];

  const reason =
    pickTrackReason('columns', columns) ??
    pickTrackReason('rows', rows) ??
    pickRegionCountReason(regions.length);

  if (reason !== null) {
    return { status: 'bad', reason };
  }

  const placed: LayoutRegion[] = regions.map((region) => ({
    name: region.name,
    column: region.column,
    row: region.row,
    columnSpan: region.columnSpan ?? 1,
    rowSpan: region.rowSpan ?? 1,
  }));

  const placement = pickPlacementReason(placed, columns.length, rows.length);

  return placement === null
    ? { status: 'ok', layout: { columns: [...columns], rows: [...rows], regions: placed } }
    : { status: 'bad', reason: placement };
}

const maxTracks = 6;
const trackPattern = /^(?:[1-9]|1[0-2])fr$/u;

function pickTrackReason(axis: string, tracks: readonly string[]): string | null {
  if (tracks.length === 0 || tracks.length > maxTracks) {
    return `a layout takes 1 to ${String(maxTracks)} ${axis}`;
  }

  const bad = tracks.find((track) => !trackPattern.test(track));

  return bad === undefined
    ? null
    : `the ${axis} take a whole number of fr from 1 to 12, such as 2fr, and ${bad} is not one`;
}

const maxRegions = 12;

function pickRegionCountReason(count: number): string | null {
  return count === 0 || count > maxRegions
    ? `a layout takes 1 to ${String(maxRegions)} regions`
    : null;
}

const namePattern = /^[a-z0-9-]{1,32}$/u;

function pickPlacementReason(
  regions: readonly LayoutRegion[],
  columnCount: number,
  rowCount: number,
): string | null {
  const taken = new Map<string, string>();
  const names = new Set<string>();

  for (const region of regions) {
    if (!namePattern.test(region.name)) {
      return `the region name ${region.name} is not 1 to 32 characters of a-z, 0-9 and hyphens`;
    }

    if (names.has(region.name)) {
      return `the region name ${region.name} is used twice`;
    }

    names.add(region.name);

    const isInGrid =
      Number.isInteger(region.column) &&
      Number.isInteger(region.row) &&
      Number.isInteger(region.columnSpan) &&
      Number.isInteger(region.rowSpan) &&
      region.column >= 1 &&
      region.row >= 1 &&
      region.columnSpan >= 1 &&
      region.rowSpan >= 1 &&
      region.column + region.columnSpan - 1 <= columnCount &&
      region.row + region.rowSpan - 1 <= rowCount;

    if (!isInGrid) {
      return `the region ${region.name} does not sit inside the ${String(columnCount)} by ${String(rowCount)} grid`;
    }

    for (let column = region.column; column < region.column + region.columnSpan; column += 1) {
      for (let row = region.row; row < region.row + region.rowSpan; row += 1) {
        const cell = `${String(column)}:${String(row)}`;
        const owner = taken.get(cell);

        if (owner !== undefined) {
          return `the regions ${owner} and ${region.name} overlap`;
        }

        taken.set(cell, region.name);
      }
    }
  }

  return null;
}
