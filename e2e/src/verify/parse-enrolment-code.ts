// `nixie enrol-code` prints the code alone on its first line, then the time it lapses.
export function parseEnrolmentCode(printed: string): string | null {
  const [first] = printed.split('\n');
  const code = first?.trim() ?? '';

  return /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u.test(code) ? code : null;
}
