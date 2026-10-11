// A URL's IPv6 host without its brackets, which neither the address check nor TLS takes.
export function toBareHost(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}
