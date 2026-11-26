const ipv4LoopbackPattern = /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/u;

// Whether a host name is the machine's own: localhost, a 127.0.0.0/8 address or ::1. A bracketed
// IPv6 host, as a URL holds it, counts too.
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;

  return host === 'localhost' || host === '::1' || ipv4LoopbackPattern.test(host);
}
