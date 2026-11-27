// The bare addresses of an address header, in lowercase NFC, in order and with no repeat. A quoted
// name may hold a comma, a comment in parentheses counts for nothing, and each member of a group
// such as `Team: a@example.org, b@example.org;` counts.
export function collectAddresses(header: string | null | undefined): string[] {
  const found: string[] = [];

  for (const entry of splitEntries(stripComments(header ?? ''))) {
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

    if ((character === ',' || character === ';') && !isQuoted && depth === 0) {
      entries.push(current);

      current = '';
    } else if (character === ':' && !isQuoted && depth === 0) {
      current = '';
    } else {
      current += character;
    }
  }

  entries.push(current);

  return entries;
}

// Drops each comment, which nests and may hold a quoted pair, but keeps a parenthesis inside quotes.
function stripComments(header: string): string {
  let result = '';
  let isQuoted = false;
  let isEscaped = false;
  let depth = 0;

  for (const character of header) {
    if (isEscaped) {
      isEscaped = false;

      if (depth === 0) {
        result += character;
      }
    } else if (character === '\\' && (isQuoted || depth > 0)) {
      isEscaped = true;

      if (depth === 0) {
        result += character;
      }
    } else if (character === '"' && depth === 0) {
      isQuoted = !isQuoted;
      result += character;
    } else if (character === '(' && !isQuoted) {
      depth += 1;
    } else if (character === ')' && !isQuoted && depth > 0) {
      depth -= 1;
    } else if (depth === 0) {
      result += character;
    }
  }

  return result;
}

const addressPattern = /^[^\s@<>,;"()]+@[^\s@<>,;"()]+\.[^\s@<>,;"()]+$/u;

function pickAddress(entry: string): string | null {
  const angle = /<(?<address>[^<>]*)>\s*$/u.exec(entry);
  const raw = (angle?.groups?.['address'] ?? entry).trim().replaceAll(/^"|"$/gu, '');
  const address = raw.normalize('NFC').toLowerCase();

  return addressPattern.test(address) ? address : null;
}
