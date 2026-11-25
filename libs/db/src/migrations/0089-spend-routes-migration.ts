import { sql } from 'kysely';
import type { Migration } from '../types';

// A route trip holds only the work on that route, so the stop of a route, the tasks it holds and the
// day's raise of a route each get a table. The release before ignores all 3, and a route trip pauses
// nothing, so the migration leaves the schema's oldest reader where it was.
export const spendRoutesMigration: Migration = {
  name: 'add the route stops, the route holds and the route raises of the spending stop',
  up: async (tx) => {
    await sql`create table if not exists spend_route_stops (
      route_id text primary key,
      period text not null,
      limit_amount real not null,
      spent_amount real not null,
      at integer not null,
      resets_at integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists spend_route_holds (
      task_id text primary key,
      route_id text not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists spend_route_raises (
      route_id text primary key,
      start text not null,
      dollars real not null,
      raised_by text not null,
      at integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);
  },
};
