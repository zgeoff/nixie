import { writeRecords } from '@heynixie/log';
import { contactUnmarkedCodec } from './contact-unmarked-codec';
import { readKnownContactIDs } from './read-known-contacts';
import type { ContactContext } from './write-contact-marked';

// false when no known contact has the ID
export async function writeContactUnmarked(
  context: ContactContext,
  contactID: string,
): Promise<boolean> {
  const held = await readKnownContactIDs(context.log.writer.db);

  if (!held.includes(contactID)) {
    return false;
  }

  await writeRecords(context.log, [
    {
      kind: contactUnmarkedCodec.kind,
      definitions: context.definitions(),
      payload: contactUnmarkedCodec.encode({ contactID }),
    },
  ]);

  return true;
}
