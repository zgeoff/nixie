// Canonical JSON, serialised as the snapshot form is: sorted keys, no whitespace, NFC strings.
// Members whose value is undefined are left out.
export function formatCanonicalJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatCanonicalJSON(item)).join(',')}]`;
  }

  if (typeof value === 'string') {
    return JSON.stringify(value.normalize('NFC'));
  }

  if (value !== null && typeof value === 'object') {
    const members = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]): [string, unknown] => [key.normalize('NFC'), item])
      .toSorted(([first], [second]) => compareCodeUnits(first, second))
      .map(([key, item]) => `${JSON.stringify(key)}:${formatCanonicalJSON(item)}`);

    return `{${members.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

function compareCodeUnits(first: string, second: string): number {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
}
