// Parses the code from what nixie's enrol-code host command prints: the code on its first line, then
// a line that says until when it works.
export function parseEnrolmentCode(stdout: string): string {
  const code = stdout.split('\n')[0]?.trim() ?? '';

  if (code === '' || /\s/u.test(code)) {
    throw new Error(`enrol-code printed no code on its first line: ${JSON.stringify(stdout)}`);
  }
  return code;
}
