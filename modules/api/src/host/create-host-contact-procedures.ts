// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { RuleContext } from '@heynixie/definitions';
import type { KnownContactEntry } from '@heynixie/policy';
import { readKnownContacts, writeContactMarked, writeContactUnmarked } from '@heynixie/policy';
import { hostImplementer } from './host-implementer';

type ContactContext = Pick<RuleContext, 'log' | 'clock' | 'definitions' | 'runInForceSeed'>;

// A mark or an unmark widens or narrows the destination limits, so each runs the seed, and the
// snapshot that later calls run under holds the new set of contacts.
export function createHostContactProcedures(context: ContactContext) {
  const contacts = hostImplementer.contacts;

  return {
    list: contacts.list.handler(async () => {
      const held = await readKnownContacts(context.log);

      return held.map((contact) => buildContactEntry(contact));
    }),

    markKnown: contacts.markKnown.handler(async (options) => {
      const marked = await writeContactMarked(context, {
        destination: options.input.destination,
        name: options.input.name ?? null,
      });

      if (marked.isNew) {
        await context.runInForceSeed();
      }

      return { contact: buildContactEntry(marked.contact), isNew: marked.isNew };
    }),

    unmark: contacts.unmark.handler(async (options) => {
      const isUnmarked = await writeContactUnmarked(context, options.input.contactID);

      if (!isUnmarked) {
        throw options.errors.NOT_FOUND({ message: 'no known contact has that ID' });
      }

      await context.runInForceSeed();

      return { contactID: options.input.contactID };
    }),
  };
}

function buildContactEntry(contact: KnownContactEntry) {
  return {
    contactID: contact.contactID,
    name: contact.name,
    destination: contact.destination,
    markedAt: new Date(contact.markedAt),
  };
}
