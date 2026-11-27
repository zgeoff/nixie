// One address, number, handle or site that a feature names as nixie's own, in the text that
// parsePlacePattern reads.
export interface OwnPlace {
  readonly place: string;
  readonly name: string | null;
}

// A feature's contribution to the directory. Core owns the list of sources and names no feature:
// the composition root fills it with one source for each feature that is on.
export interface OwnPlaceSource {
  readonly read: () => Promise<readonly OwnPlace[]>;
}
