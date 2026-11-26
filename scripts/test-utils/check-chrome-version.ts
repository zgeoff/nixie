import { parseChromeVersion } from './parse-chrome-version';

export function checkChromeVersion(label: string, output: string, pinnedVersion: string): void {
  const actual = parseChromeVersion(output);

  if (actual !== pinnedVersion) {
    throw new Error(
      `${label} runs Chrome ${actual ?? `(unreadable: ${output.trim()})`}, but chrome-pin.json pins ${pinnedVersion}`,
    );
  }
}
