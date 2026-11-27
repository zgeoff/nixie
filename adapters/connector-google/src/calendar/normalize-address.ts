// An address as a destination: trimmed, in lowercase NFC.
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().normalize('NFC');
}
