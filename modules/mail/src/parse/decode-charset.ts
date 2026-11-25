// Reads bytes in the named charset. A charset that nixie does not read as such reads as UTF-8, which
// holds ASCII too.
export function decodeCharset(bytes: Uint8Array, charset: string): string {
  const name = charset.trim().toLowerCase();

  if (name === 'iso-8859-1' || name === 'latin1') {
    return new TextDecoder('iso-8859-1').decode(bytes);
  }

  if (name === 'windows-1252') {
    return new TextDecoder('windows-1252').decode(bytes);
  }

  return new TextDecoder('utf-8').decode(bytes);
}
