const quotedPattern = /"(?:[^"\\]|\\.)*"/gu;
const angleAddressPattern = /<(?<angle>[^<>\s]+@[^<>\s]+)>/u;
const bareAddressPattern = /(?<bare>[^\s,;<>"]+@[^\s,;<>"]+)/u;

// The addresses of an address header, lowered, without their display names. A mailbox that has an
// address in angle brackets takes that one, so an address inside its display name never counts.
export function collectAddresses(values: readonly string[]): string[] {
  return values.flatMap((value) =>
    value
      .replaceAll(quotedPattern, '""')
      .split(',')
      .flatMap((mailbox) => {
        const found =
          angleAddressPattern.exec(mailbox)?.groups?.['angle'] ??
          bareAddressPattern.exec(mailbox)?.groups?.['bare'];

        return found === undefined ? [] : [found.toLowerCase()];
      }),
  );
}
