import { sql } from 'kysely';
import type { Migration } from './types';

export const dropMessageRoutesMigration: Migration = {
  name: 'drop the table of where each routed message went',
  up: async (tx) => {
    await sql`drop table if exists message_routes`.execute(tx);
  },
};
