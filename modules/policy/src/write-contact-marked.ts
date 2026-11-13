import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { contactMarkedKnownCodec } from './contact-marked-known-codec';
import type { KnownContactEntry } from './read-known-contacts';
import { readKnownContacts } from './read-known-contacts';

export interface ContactContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
}

export interface ContactMark {
  readonly destination: string;
  readonly name: string | null;
}

export interface ContactMarkResult {
  readonly contact: KnownContactEntry;
  readonly isNew: boolean;
}

// A destination that a known contact already holds changes nothing.
export async function writeContactMarked(
  context: ContactContext,
  mark: ContactMark,
): Promise<ContactMarkResult> {
  const destination = mark.destination.normalize('NFC');

  const held = await readKnownContacts(context.log);

  const existing = held.find((contact) => contact.destination === destination);

  if (existing !== undefined) {
    return { contact: existing, isNew: false };
  }

  const contactID = crypto.randomUUID();

  await writeRecords(context.log, [
    {
      kind: contactMarkedKnownCodec.kind,
      definitions: context.definitions(),
      payload: contactMarkedKnownCodec.encode({ contactID }),
      erasable: { name: mark.name?.normalize('NFC') ?? null, destination },
    },
  ]);

  const [contact] = await readKnownContacts(context.log, [contactID]);

  return {
    contact: contact ?? { contactID, name: mark.name, destination, markedAt: context.clock.now() },
    isNew: true,
  };
}
