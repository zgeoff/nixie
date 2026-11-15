const ipv4Pattern = /^\d{1,3}(?:\.\d{1,3}){3}$/u;

export interface RegistrationOrigin {
  readonly origin: string;
  readonly rpID: string;
}

// WebAuthn takes only a domain as the RP ID and runs only in a secure context, so the origin must
// be https with a domain name. Returns null for anything else.
export function parseRegistrationOrigin(header: string | undefined): RegistrationOrigin | null {
  if (header === undefined) {
    return null;
  }

  const url = URL.parse(header);

  if (url === null || url.protocol !== 'https:' || url.origin === 'null') {
    return null;
  }

  const isIP = url.hostname.startsWith('[') || ipv4Pattern.test(url.hostname);

  return isIP ? null : { origin: url.origin, rpID: url.hostname };
}
