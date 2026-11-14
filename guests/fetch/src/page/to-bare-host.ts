export function toBareHost(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}
