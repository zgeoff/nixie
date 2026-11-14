import type { KnownContact } from './types';

export type IsTypedText = (text: string) => boolean;

// Every destination must appear word for word in typed text, or be the destination of the one known
// contact whose name stands alone as a word in typed text. A name two contacts share names no one.
export function isCodeCheckPassed(
  destinations: readonly string[],
  contacts: readonly KnownContact[],
  isTyped: IsTypedText,
  isTypedName: IsTypedText,
): boolean {
  const named = collectTypedNames(contacts, isTypedName);

  return destinations.every(
    (destination) =>
      isTyped(destination) || named.some((contact) => contact.destination === destination),
  );
}

function collectTypedNames(
  contacts: readonly KnownContact[],
  isTyped: IsTypedText,
): readonly KnownContact[] {
  const byName = Map.groupBy(
    contacts.filter((contact) => contact.name !== null && contact.destination !== null),
    (contact) => contact.name,
  );

  return [...byName.entries()].flatMap(([name, held]) =>
    name !== null && held.length === 1 && isTyped(name) ? held : [],
  );
}
