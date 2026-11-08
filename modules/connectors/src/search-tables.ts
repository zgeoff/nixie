import type { CheckedTables } from '@heynixie/db';

// The calls the search tool sent on one day, in the zone whose midnight starts the cap's day.
interface SearchCallRow {
  readonly day: string;
  readonly count: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type SearchTables = CheckedTables<Readonly<{ search_calls: SearchCallRow }>>;
