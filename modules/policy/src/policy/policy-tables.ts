import type { CheckedTables } from '@heynixie/db';

export type PolicyTables = CheckedTables<
  Readonly<{
    known_contacts: {
      readonly contact_id: string;
      readonly marked_sequence: number;
      readonly unmarked_sequence: number | null;
    };
    places: {
      readonly place_id: string;
      readonly short_id: string;
      readonly origin: string;
      readonly kind: string;
      readonly trust: string;
      readonly added_by: string;
      readonly name: string | null;
      readonly domain: string | null;
      readonly subdomains: number | null;
      readonly added_sequence: number;
      readonly removed_sequence: number | null;
      readonly name_sequence: number | null;
      readonly last_used_at: number | null;
    };
  }>
>;
