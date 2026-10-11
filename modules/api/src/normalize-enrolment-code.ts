// Turns a code as a person types it into the form nixie hashes: upper case, with the spaces and
// dashes a person adds or drops left out, so "k7p2x-q9m4d" and "K7P2X Q9M4D" are one code.
export function normalizeEnrolmentCode(code: string): string {
  return code.toUpperCase().replaceAll(/[\s-]/gu, '');
}
