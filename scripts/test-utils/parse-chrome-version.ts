// `chrome --version` prints a line such as "Google Chrome for Testing 159.0.8154.6".
export function parseChromeVersion(output: string): string | null {
  return /\b(?<version>\d+\.\d+\.\d+\.\d+)\b/u.exec(output)?.groups?.['version'] ?? null;
}
