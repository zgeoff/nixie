const inboxUUIDPattern = /^6e697869-0000-8000-8000-(?<sequence>[\da-f]{12})$/u;

// Decodes the record sequence that encodeInboxUUID put in a uuid, or null for a uuid that holds
// none, such as one the CLI made itself.
export function decodeInboxUUID(uuid: string): number | null {
  const hex = inboxUUIDPattern.exec(uuid)?.groups?.['sequence'];

  return hex === undefined ? null : Number.parseInt(hex, 16);
}
