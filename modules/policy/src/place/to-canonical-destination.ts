import { formatPlaceKey } from './format-place-key';
import { parsePlace } from './parse-place';

// The text of a destination in the form the directory compares: a site without its port and any
// leading www, an address in lower case. Text that is no place stays as it is.
export function toCanonicalDestination(text: string): string {
  const parsed = parsePlace(text);

  if (parsed === null) {
    return text;
  }

  const key = parsed.kind === 'site' ? { ...parsed, subdomains: false } : parsed;

  return formatPlaceKey(key);
}
