const maxSequence = 0xff_ff_ff_ff_ff_ff;

export function encodeInboxUUID(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > maxSequence) {
    throw new Error(`no inbox uuid holds the sequence ${sequence}`);
  }

  return `6e697869-0000-8000-8000-${sequence.toString(16).padStart(12, '0')}`;
}
