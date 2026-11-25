// Reads quoted-printable text into bytes. A soft line break joins its lines.
export function decodeQuotedPrintable(text: string): Uint8Array {
  const joined = text.replaceAll(/=\r?\n/gu, '');
  const bytes: number[] = [];

  for (let index = 0; index < joined.length; index += 1) {
    const hex = joined.slice(index + 1, index + 3);

    if (joined[index] === '=' && /^[0-9A-Fa-f]{2}$/u.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));

      index += 2;
    } else {
      bytes.push(...Buffer.from(joined.charAt(index), 'latin1'));
    }
  }

  return new Uint8Array(bytes);
}
