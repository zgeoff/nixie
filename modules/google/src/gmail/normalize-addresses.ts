// Addresses in the one form that the decision point and a comparison use: NFC and lowercase.
export function normalizeAddresses(addresses: readonly string[] | undefined): string[] {
  return (addresses ?? []).map((address) => address.normalize('NFC').toLowerCase());
}
