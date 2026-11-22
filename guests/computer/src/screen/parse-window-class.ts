// Reads `WM_CLASS(STRING) = "chromium", "Chromium"` as its lowercase words joined by spaces.
export function parseWindowClass(output: string): string {
  return [...output.matchAll(/"(?<name>[^"]*)"/gu)]
    .map((found) => found.groups?.['name'] ?? '')
    .join(' ')
    .toLowerCase();
}
