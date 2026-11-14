import type { CheckedTables } from '@heynixie/db';

export type PolicyTables = CheckedTables<
  Readonly<{
    known_contacts: {
      readonly contact_id: string;
      readonly marked_sequence: number;
      readonly unmarked_sequence: number | null;
    };
  }>
>;
