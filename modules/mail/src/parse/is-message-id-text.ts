// A Message-ID without its angle brackets that is safe to write into a header: printable ASCII with
// no space and no angle bracket.
export function isMessageIDText(value: string): boolean {
  return /^[!-;=?-~]+$/u.test(value);
}
