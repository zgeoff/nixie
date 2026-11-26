// The addresses of the live Google connections, in lowercase NFC and with no repeat. A mail to one
// of them is a mail to you, so it needs no card.
export function collectOwnerAddresses(accounts: readonly string[]): string[] {
  return [...new Set(accounts.map((account) => account.normalize('NFC').toLowerCase()))];
}
