// A destination is one concrete place: what a call reaches.
export type Destination =
  | { readonly kind: 'site'; readonly domain: string }
  | { readonly kind: 'address'; readonly address: string }
  | { readonly kind: 'phone'; readonly e164: string }
  | { readonly kind: 'handle'; readonly channel: string; readonly id: string };

// A place key is what an entry stores. It may cover many destinations.
export type PlaceKey =
  | { readonly kind: 'site'; readonly domain: string; readonly subdomains: boolean }
  | { readonly kind: 'address'; readonly address: string }
  | { readonly kind: 'mail_domain'; readonly domain: string; readonly subdomains: boolean }
  | { readonly kind: 'phone'; readonly e164: string }
  | { readonly kind: 'handle'; readonly channel: string; readonly id: string }
  | { readonly kind: 'raw'; readonly value: string };

export const trustLevels = ['blocked', 'known', 'read', 'act', 'self'] as const;

// self is one of your own addresses, numbers or handles: as act, with no notice
export type Trust = (typeof trustLevels)[number];

export const placeAddedByValues = ['you', 'proposal', 'card', 'seed', 'nixie_own'] as const;

export type PlaceAddedBy = (typeof placeAddedByValues)[number];

export interface Place {
  readonly placeID: string;
  readonly shortID: string;
  readonly key: PlaceKey;
  readonly trust: Trust;
  readonly name: string | null;
  readonly addedBy: PlaceAddedBy;
}

// What a destination looks like to the matcher: the parsed form, and the string as declared.
export interface DestinationText {
  readonly parsed: Destination | null;
  readonly raw: string;
}

// A site or mail domain entry of the directory that the seed may have added.
export interface SeedPlaceRow {
  readonly placeID: string;
  readonly key: Extract<PlaceKey, { kind: 'site' | 'mail_domain' }>;
  readonly trust: Trust;
  readonly name: string | null;
  readonly addedBy: string;

  // true when a places.changed record named the entry since it was added
  readonly isChanged: boolean;
}

export interface PlacesSeedAdd {
  readonly placeID: string;
  readonly shortID: string;
  readonly key: Extract<PlaceKey, { kind: 'site' | 'mail_domain' }>;
  readonly trust: Exclude<Trust, 'self'>;
  readonly name: string | null;
}

export interface PlacesSeedPlan {
  readonly adds: readonly PlacesSeedAdd[];
  readonly removes: readonly string[];
}

// The part of a place the decision point reads from a snapshot's directory.
export interface PlaceEntry {
  readonly placeID: string;
  readonly shortID: string;
  readonly key: PlaceKey;
  readonly trust: Trust;
}
