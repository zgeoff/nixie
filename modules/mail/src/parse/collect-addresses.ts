const addressPattern = /<(?<angle>[^<>\s]+@[^<>\s]+)>|(?<bare>[^\s,;<>"]+@[^\s,;<>"]+)/gu;

// The addresses of an address header, lowered, without their display names.
export function collectAddresses(values: readonly string[]): string[] {
  return values.flatMap((value) =>
    [...value.matchAll(addressPattern)].map((match) =>
      (match.groups?.['angle'] ?? match.groups?.['bare'] ?? '').toLowerCase(),
    ),
  );
}
