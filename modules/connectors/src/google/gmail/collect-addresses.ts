// The bare addresses of an address header, in lowercase NFC, in order and with no repeat. A name
// that holds a comma or an angle bracket stays inside its quotes.
export function collectAddresses(header: string | null | undefined): string[] {
  const found: string[] = [];

  for (const entry of splitEntries(header ?? '')) {
    const address = pickAddress(entry);

    if (address !== null && !found.includes(address)) {
      found.push(address);
    }
  }

  return found;
}

function splitEntries(header: string): string[] {
  const entries: string[] = [];
  let current = '';
  let isQuoted = false;
  let depth = 0;

  for (const character of header) {
    if (character === '"') {
      isQuoted = !isQuoted;
    } else if (!isQuoted && character === '<') {
      depth += 1;
    } else if (!isQuoted && character === '>') {
      depth = Math.max(0, depth - 1);
    }

    if (character === ',' && !isQuoted && depth === 0) {
      entries.push(current);

      current = '';
    } else {
      current += character;
    }
  }

  entries.push(current);

  return entries;
}

const addressPattern = /^[^\s@<>,;"()]+@[^\s@<>,;"()]+\.[^\s@<>,;"()]+$/u;

function pickAddress(entry: string): string | null {
  const angle = /<(?<address>[^<>]*)>\s*$/u.exec(entry);
  const raw = (angle?.groups?.['address'] ?? entry).trim().replaceAll(/^"|"$/gu, '');
  const address = raw.normalize('NFC').toLowerCase();

  return addressPattern.test(address) ? address : null;
}
