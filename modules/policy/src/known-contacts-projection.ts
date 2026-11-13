import type { Projection } from '@heynixie/log';
import { contactMarkedKnownCodec } from './contact-marked-known-codec';
import { contactUnmarkedCodec } from './contact-unmarked-codec';
import type { PolicyTables } from './policy-tables';

export const knownContactsProjection: Projection = {
  table: 'known_contacts',
  keyColumn: 'contact_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<PolicyTables>();

    if (record.kind === contactMarkedKnownCodec.kind) {
      const marked = contactMarkedKnownCodec.decode(record.payload);
      const contactID = marked.contactID;

      await db
        .insertInto('known_contacts')
        .values({
          contact_id: contactID,
          marked_sequence: record.sequence,
          unmarked_sequence: null,
        })
        .execute();

      return [contactID];
    }

    if (record.kind === contactUnmarkedCodec.kind) {
      const unmarked = contactUnmarkedCodec.decode(record.payload);
      const contactID = unmarked.contactID;

      await db
        .updateTable('known_contacts')
        .set({ unmarked_sequence: record.sequence })
        .where('contact_id', '=', contactID)
        .where('unmarked_sequence', 'is', null)
        .execute();

      return [contactID];
    }

    return [];
  },
};
