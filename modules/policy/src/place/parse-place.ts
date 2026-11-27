import { chatChannels } from './chat-channels';
import { isPublicSuffix } from './is-public-suffix';
import type { Destination } from './types';

const addressPattern = /^[^@\s/:]+@[^@\s/]+$/u;
const handlePattern = /^(?<channel>[a-z][a-z0-9_]*):(?<id>\S+)$/u;
const hostPattern = /^[^\s/@?#]+$/u;

// Reads what a call reaches as one concrete place, or null when the text is no place. It tries a URL,
// an address, a phone number, a handle, then a host with an optional port.
export function parsePlace(text: string): Destination | null {
  const trimmed = text.normalize('NFC').trim();

  if (trimmed.includes('://')) {
    return parseURLSite(trimmed);
  }

  if (addressPattern.test(trimmed)) {
    return { kind: 'address', address: trimmed.toLowerCase() };
  }

  const phone = parsePhone(trimmed);

  if (phone !== null) {
    return phone;
  }

  const handle = handlePattern.exec(trimmed)?.groups;

  if (handle?.['channel'] !== undefined && chatChannels.includes(handle['channel'])) {
    return { kind: 'handle', channel: handle['channel'], id: handle['id'] ?? '' };
  }

  return hostPattern.test(trimmed) ? parseHostSite(trimmed) : null;
}

function parseURLSite(text: string): Destination | null {
  return URL.canParse(text) ? toSite(new URL(text).hostname) : null;
}

function toSite(hostname: string): Destination | null {
  const host = hostname.replaceAll(/^\[|\]$/gu, '').replace(/\.$/u, '');

  return host === '' ? null : { kind: 'site', domain: dropWWW(host) };
}

// A site's normal form drops one leading www. label, unless what remains is a public suffix.
function dropWWW(host: string): string {
  if (!host.startsWith('www.')) {
    return host;
  }

  const rest = host.slice(4);

  return rest === '' || isPublicSuffix(rest) ? host : rest;
}

const phonePattern = /^\+[\d\s-]+$/u;

function parsePhone(text: string): Destination | null {
  if (!phonePattern.test(text)) {
    return null;
  }

  const digits = text.slice(1).replaceAll(/[\s-]/gu, '');

  return digits.length >= 6 && digits.length <= 15 ? { kind: 'phone', e164: `+${digits}` } : null;
}

function parseHostSite(text: string): Destination | null {
  const url = `http://${text}`;

  return URL.canParse(url) ? toSite(new URL(url).hostname) : null;
}
