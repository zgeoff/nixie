// The largest sequence a uuid holds: 12 hex digits.
const maxSequence = 0xff_ff_ff_ff_ff_ff;

// Encodes an inbox record's sequence as the uuid its SDK message carries, which decodeInboxUUID
// reads back. The log keys a record by its sequence, so the uuid holds it after a fixed prefix
// that spells nixi, in the form of a version 8 uuid.
export function encodeInboxUUID(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > maxSequence) {
    throw new Error(`no inbox uuid holds the sequence ${sequence}`);
  }

  return `6e697869-0000-8000-8000-${sequence.toString(16).padStart(12, '0')}`;
}
