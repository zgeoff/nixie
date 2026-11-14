// The host the URL parser gives, lowercased and with any port.
export function readFetchHost(url: string): string {
  return new URL(url).host.toLowerCase();
}
