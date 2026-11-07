export function isPatternMatch(pattern: string, text: string): boolean {
  const parts = pattern.normalize('NFC').split('*');
  const target = text.normalize('NFC');
  const first = parts[0] ?? '';

  if (parts.length === 1) {
    return target === first;
  }

  const last = parts.at(-1) ?? '';

  if (target.length < first.length + last.length) {
    return false;
  }

  if (!target.startsWith(first) || !target.endsWith(last)) {
    return false;
  }

  const end = target.length - last.length;
  let at = first.length;

  for (const middle of parts.slice(1, -1)) {
    const found = target.indexOf(middle, at);

    if (found === -1 || found + middle.length > end) {
      return false;
    }

    at = found + middle.length;
  }

  return true;
}
